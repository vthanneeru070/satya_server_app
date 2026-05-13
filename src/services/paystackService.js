/**
 * Paystack integration.
 *
 * All HTTP calls go through axios; webhook signature is verified with HMAC-SHA512
 * using the SAME secret key as the API requests (Paystack uses a single secret).
 *
 * Required env vars:
 *   PAYSTACK_SECRET_KEY     sk_test_... or sk_live_...
 *   PAYSTACK_CALLBACK_URL   (optional) where Paystack redirects after redirect-flow payment
 *
 * Amount semantics:
 *   Paystack expects amounts in the smallest subunit. For ZAR that's cents
 *   (1 R = 100). For NGN it's kobo (1 NGN = 100). Multiply major-units by 100.
 */

const crypto = require("crypto");
const axios = require("axios");
const HttpError = require("../utils/httpError");

const PAYSTACK_BASE_URL = "https://api.paystack.co";

// Paystack-supported currencies → subunit multiplier.
// Source: https://paystack.com/docs/payments/multicurrency
const CURRENCY_SUBUNIT = {
  NGN: 100,
  GHS: 100,
  ZAR: 100,
  USD: 100,
  KES: 100,
};

const readConfig = () => ({
  secretKey: process.env.PAYSTACK_SECRET_KEY,
  callbackUrl: process.env.PAYSTACK_CALLBACK_URL || null,
  publicKey: process.env.PAYSTACK_PUBLIC_KEY || null,
});

const assertConfigured = () => {
  const { secretKey } = readConfig();
  if (!secretKey) {
    throw new HttpError(
      "Paystack is not configured on the server (PAYSTACK_SECRET_KEY missing).",
      500
    );
  }
};

const toSubunit = (amountInMajor, currency = "ZAR") => {
  const upper = String(currency || "ZAR").toUpperCase();
  const multiplier = CURRENCY_SUBUNIT[upper];
  if (!multiplier) {
    throw new HttpError(
      `Currency "${upper}" is not supported by Paystack. Use one of: ${Object.keys(
        CURRENCY_SUBUNIT
      ).join(", ")}.`,
      400
    );
  }
  // Round to nearest cent to avoid float drift (e.g. 99.999 → 10000).
  return Math.round(Number(amountInMajor) * multiplier);
};

const fromSubunit = (amountInSub, currency = "ZAR") => {
  const upper = String(currency || "ZAR").toUpperCase();
  const multiplier = CURRENCY_SUBUNIT[upper] || 100;
  return Number(amountInSub) / multiplier;
};

const buildHttpClient = () => {
  const { secretKey } = readConfig();
  return axios.create({
    baseURL: PAYSTACK_BASE_URL,
    timeout: 15_000,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
  });
};

/**
 * Wrap an axios error into our standard HttpError with the Paystack message
 * surfaced. Network/timeout errors become 502; auth/validation pass through
 * with Paystack's `message`.
 */
const wrapPaystackError = (err, fallbackMessage) => {
  const status = err?.response?.status;
  const body = err?.response?.data;
  const reason = body?.message || err?.message || fallbackMessage;
  if (!status) {
    return new HttpError(`Paystack unreachable: ${reason}`, 502);
  }
  // Paystack returns 4xx for client-side issues (bad amount, bad currency, etc).
  return new HttpError(`Paystack: ${reason}`, status >= 400 && status < 500 ? 400 : 502);
};

/**
 * Initialize a transaction. Returns the data Paystack gave us, including
 * `reference`, `access_code`, and `authorization_url`. The frontend can pick:
 *   - SDK / Inline: use `access_code` to open the Paystack popup
 *   - Webview / Redirect: open `authorization_url`
 *
 * If `reference` is supplied, Paystack will use ours instead of generating one,
 * which lets the backend correlate orders → transactions ahead of time.
 */
const initializeTransaction = async ({
  email,
  amountInMajor,
  currency = "ZAR",
  reference,
  callbackUrl,
  metadata = {},
  channels,
}) => {
  assertConfigured();
  if (!email) throw new HttpError("email is required to initialize Paystack", 400);
  if (!Number.isFinite(Number(amountInMajor)) || Number(amountInMajor) <= 0) {
    throw new HttpError("amount must be a positive number", 400);
  }

  const { callbackUrl: defaultCallback } = readConfig();
  const payload = {
    email,
    amount: toSubunit(amountInMajor, currency),
    currency: String(currency).toUpperCase(),
    reference,
    metadata,
    callback_url: callbackUrl || defaultCallback || undefined,
    channels,
  };

  try {
    const { data } = await buildHttpClient().post("/transaction/initialize", payload);
    if (!data?.status) {
      throw new HttpError(data?.message || "Paystack rejected the request", 400);
    }
    return data.data; // { authorization_url, access_code, reference }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw wrapPaystackError(err, "Failed to initialize Paystack transaction");
  }
};

/**
 * Verify a transaction by reference. Use this from your verify endpoint AND
 * from the webhook handler — both should call this so the order ends up in
 * the same state regardless of which path completes first.
 *
 * Returns the full Paystack verify payload. Caller decides what to do with it.
 */
const verifyTransaction = async (reference) => {
  assertConfigured();
  if (!reference) throw new HttpError("reference is required", 400);

  try {
    const { data } = await buildHttpClient().get(
      `/transaction/verify/${encodeURIComponent(reference)}`
    );
    if (!data?.status) {
      throw new HttpError(data?.message || "Paystack verify failed", 400);
    }
    return data.data; // { status: "success"|..., amount, channel, paid_at, ... }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw wrapPaystackError(err, "Failed to verify Paystack transaction");
  }
};

/**
 * Trigger a refund on Paystack. Either `reference` (the charge reference) or
 * `transactionId` must be supplied. Amount is optional — omit for a full refund.
 *
 * Paystack returns:
 *   {
 *     transaction: { id, reference, amount, currency, ... },
 *     id: <refund-id>,
 *     status: "processing" | "processed" | "failed" | "pending",
 *     ...
 *   }
 *
 * `processing` is the normal happy path — the actual settlement happens
 * asynchronously and Paystack fires a `refund.processed` webhook later.
 */
const refundTransaction = async ({
  reference,
  transactionId,
  amountInMajor,
  currency = "ZAR",
  customerNote,
  merchantNote,
}) => {
  assertConfigured();
  if (!reference && !transactionId) {
    throw new HttpError(
      "reference or transactionId is required to refund a Paystack transaction",
      400
    );
  }

  const payload = {
    transaction: reference || transactionId,
  };
  if (amountInMajor != null) {
    payload.amount = toSubunit(amountInMajor, currency);
    payload.currency = String(currency).toUpperCase();
  }
  if (customerNote) payload.customer_note = String(customerNote).slice(0, 300);
  if (merchantNote) payload.merchant_note = String(merchantNote).slice(0, 300);

  try {
    const { data } = await buildHttpClient().post("/refund", payload);
    if (!data?.status) {
      throw new HttpError(data?.message || "Paystack refund failed", 400);
    }
    return data.data;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw wrapPaystackError(err, "Failed to refund Paystack transaction");
  }
};

/**
 * Verify the `x-paystack-signature` header against the raw request body using
 * HMAC-SHA512 with the secret key. Returns true/false — never throws — so
 * the route can decide whether to 401 or process.
 */
const verifyWebhookSignature = (rawBody, signature) => {
  const { secretKey } = readConfig();
  if (!secretKey || !rawBody || !signature) return false;
  const expected = crypto
    .createHmac("sha512", secretKey)
    .update(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"))
    .digest("hex");
  // Constant-time comparison.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(String(signature), "hex")
    );
  } catch (_) {
    return false;
  }
};

module.exports = {
  initializeTransaction,
  verifyTransaction,
  refundTransaction,
  verifyWebhookSignature,
  toSubunit,
  fromSubunit,
  CURRENCY_SUBUNIT,
};
