/**
 * PayFast integration (South Africa).
 *
 * Redirect checkout: signed form POST to /eng/process.
 * Settlement: Instant Transaction Notification (ITN) POST to notify_url.
 *
 * Required env vars:
 *   PAYFAST_MERCHANT_ID
 *   PAYFAST_MERCHANT_KEY
 *   PAYFAST_PASSPHRASE          (required for live; recommended for sandbox)
 *   PAYFAST_SANDBOX             "true" | "false" (default: true when NODE_ENV !== production)
 *   PAYFAST_RETURN_URL          user redirect after payment (falls back to PAYSTACK_CALLBACK_URL)
 *   PAYFAST_CANCEL_URL          user redirect on cancel (falls back to /payment-failed on same host)
 *   PAYFAST_NOTIFY_URL          ITN webhook URL (falls back to PAYSTACK_WEBHOOK_URL with /itn path)
 */

const crypto = require("crypto");
const axios = require("axios");
const HttpError = require("../utils/httpError");

const PAYFAST_HOSTS = {
  live: "www.payfast.co.za",
  sandbox: "sandbox.payfast.co.za",
};

const PAYFAST_API_BASE = "https://api.payfast.co.za";

const VALID_NOTIFY_HOSTS = [
  "www.payfast.co.za",
  "w1w.payfast.co.za",
  "w2w.payfast.co.za",
  "sandbox.payfast.co.za",
];

const readConfig = () => {
  const sandbox =
    process.env.PAYFAST_SANDBOX != null
      ? String(process.env.PAYFAST_SANDBOX).toLowerCase() === "true"
      : process.env.NODE_ENV !== "production";

  const host = sandbox ? PAYFAST_HOSTS.sandbox : PAYFAST_HOSTS.live;

  return {
    merchantId: String(process.env.PAYFAST_MERCHANT_ID || "").trim(),
    merchantKey: String(process.env.PAYFAST_MERCHANT_KEY || "").trim(),
    passphrase: String(process.env.PAYFAST_PASSPHRASE || "").trim(),
    sandbox,
    host,
    processUrl: `https://${host}/eng/process`,
    validateUrl: `https://${host}/eng/query/validate`,
    returnUrl:
      process.env.PAYFAST_RETURN_URL ||
      process.env.PAYSTACK_CALLBACK_URL ||
      null,
    cancelUrl: process.env.PAYFAST_CANCEL_URL || null,
    notifyUrl:
      process.env.PAYFAST_NOTIFY_URL ||
      (process.env.PAYSTACK_WEBHOOK_URL
        ? String(process.env.PAYSTACK_WEBHOOK_URL).replace(/\/webhook\/?$/, "/itn")
        : null),
    skipIpCheck: String(process.env.PAYFAST_SKIP_IP_CHECK || "").toLowerCase() === "true",
  };
};

const assertConfigured = () => {
  const { merchantId, merchantKey, sandbox, host } = readConfig();
  if (!merchantId || !merchantKey) {
    throw new HttpError(
      "PayFast is not configured on the server. Set PAYFAST_MERCHANT_ID and PAYFAST_MERCHANT_KEY in the server environment.",
      500
    );
  }
  if (!/^\d{5,10}$/.test(merchantId)) {
    throw new HttpError(
      `PayFast merchant ID "${merchantId}" looks invalid. Use the numeric Merchant ID from your PayFast ${sandbox ? "sandbox" : "live"} dashboard (Settings → Integration).`,
      500
    );
  }
  if (/^(your_|xxx|test|placeholder)/i.test(merchantId)) {
    throw new HttpError(
      "PayFast merchant ID is still a placeholder. Copy the real Merchant ID from your PayFast dashboard.",
      500
    );
  }
  console.log(
    `[payfast] checkout configured for ${sandbox ? "SANDBOX" : "LIVE"} (${host}), merchant_id=${merchantId}`
  );
};

/** PayFast expects a decimal string with exactly two fractional digits. */
const formatAmount = (amountInMajor) =>
  Number(amountInMajor).toFixed(2);

/**
 * Build an MD5 signature from field map (insertion order preserved).
 * Empty string values are excluded per PayFast docs.
 */
const generateSignature = (fields, passphrase = null) => {
  let paramString = "";
  for (const [key, rawVal] of Object.entries(fields)) {
    if (key === "signature") continue;
    const val = rawVal == null ? "" : String(rawVal).trim();
    if (val === "") continue;
    paramString += `${key}=${encodeURIComponent(val).replace(/%20/g, "+")}&`;
  }
  paramString = paramString.slice(0, -1);
  if (passphrase != null && String(passphrase).trim() !== "") {
    paramString += `&passphrase=${encodeURIComponent(String(passphrase).trim()).replace(/%20/g, "+")}`;
  }
  return crypto.createHash("md5").update(paramString).digest("hex");
};

/**
 * Build the ITN param string from ordered [key, value] pairs (until `signature`).
 */
const buildItnParamStringFromEntries = (entries) => {
  let paramString = "";
  for (const [key, val] of entries) {
    if (key === "signature") break;
    const value = val == null ? "" : String(val);
    paramString += `${key}=${encodeURIComponent(value).replace(/%20/g, "+")}&`;
  }
  return paramString.slice(0, -1);
};

const buildItnParamString = (posted, orderedEntries = null) => {
  if (orderedEntries?.length) {
    return buildItnParamStringFromEntries(orderedEntries);
  }
  return buildItnParamStringFromEntries(Object.entries(posted || {}));
};

/** Parse raw application/x-www-form-urlencoded ITN body preserving field order. */
const parseItnRawBody = (raw) => {
  const body = typeof raw === "string" ? raw : raw?.toString?.("utf8") || "";
  const entries = [];
  const params = new URLSearchParams(body);
  for (const [key, value] of params) {
    entries.push([key, value]);
  }
  return {
    entries,
    data: Object.fromEntries(entries),
    paramString: buildItnParamStringFromEntries(entries),
  };
};

const verifyItnSignature = (posted, passphrase = null, orderedEntries = null) => {
  const signature = posted?.signature;
  if (!signature) return false;
  const paramString = buildItnParamString(posted, orderedEntries);
  const { passphrase: configuredPassphrase } = readConfig();
  const effectivePassphrase = passphrase ?? configuredPassphrase;
  let tempParamString = paramString;
  if (effectivePassphrase && String(effectivePassphrase).trim() !== "") {
    tempParamString += `&passphrase=${encodeURIComponent(String(effectivePassphrase).trim()).replace(/%20/g, "+")}`;
  }
  const expected = crypto.createHash("md5").update(tempParamString).digest("hex");
  const received = String(signature).trim().toLowerCase();
  return expected === received;
};

const validateItnWithPayfast = async (paramString) => {
  const { validateUrl } = readConfig();
  try {
    const { data } = await axios.post(validateUrl, paramString, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 15_000,
      transformRequest: [(body) => body],
    });
    return String(data || "").trim().toUpperCase() === "VALID";
  } catch (err) {
    console.error("[payfast] ITN server validation failed:", err?.message || err);
    return false;
  }
};

const isValidNotifySource = (referer) => {
  const { skipIpCheck } = readConfig();
  if (skipIpCheck || !referer) return true;
  try {
    const host = new URL(referer).hostname;
    return VALID_NOTIFY_HOSTS.includes(host);
  } catch (_) {
    return false;
  }
};

const resolveCancelUrl = (returnUrl) => {
  const { cancelUrl } = readConfig();
  if (cancelUrl) return cancelUrl;
  if (returnUrl) {
    try {
      const url = new URL(returnUrl);
      url.pathname = "/payment-failed";
      url.search = "";
      return url.toString();
    } catch (_) {
      /* fall through */
    }
  }
  return null;
};

/**
 * Build signed PayFast checkout fields. Returns everything the client needs to
 * POST a form to `processUrl`, plus backward-compatible authorization_url.
 */
const initializeTransaction = async ({
  email,
  amountInMajor,
  currency = "ZAR",
  reference,
  returnUrl,
  cancelUrl,
  notifyUrl,
  itemName,
  itemDescription,
  nameFirst,
  nameLast,
  metadata = {},
}) => {
  assertConfigured();
  const config = readConfig();

  const upperCurrency = String(currency || "ZAR").toUpperCase();
  if (upperCurrency !== "ZAR") {
    throw new HttpError("PayFast only supports ZAR payments.", 400);
  }
  if (!email) throw new HttpError("email is required to initialize PayFast", 400);
  if (!Number.isFinite(Number(amountInMajor)) || Number(amountInMajor) <= 0) {
    throw new HttpError("amount must be a positive number", 400);
  }
  if (!reference) throw new HttpError("reference is required", 400);

  const effectiveReturnUrl = returnUrl || config.returnUrl;
  const effectiveCancelUrl = cancelUrl || resolveCancelUrl(effectiveReturnUrl);
  const effectiveNotifyUrl = notifyUrl || config.notifyUrl;

  if (!effectiveReturnUrl) {
    throw new HttpError(
      "PayFast return URL is not configured (PAYFAST_RETURN_URL or PAYSTACK_CALLBACK_URL).",
      500
    );
  }
  if (!effectiveNotifyUrl) {
    throw new HttpError(
      "PayFast notify URL is not configured (PAYFAST_NOTIFY_URL).",
      500
    );
  }

  const fields = {
    merchant_id: config.merchantId,
    merchant_key: config.merchantKey,
    return_url: effectiveReturnUrl,
    cancel_url: effectiveCancelUrl || effectiveReturnUrl,
    notify_url: effectiveNotifyUrl,
    name_first: nameFirst || "",
    name_last: nameLast || "",
    email_address: email,
    m_payment_id: reference,
    amount: formatAmount(amountInMajor),
    item_name: itemName || `Payment ${reference}`.slice(0, 100),
    item_description: (itemDescription || "").slice(0, 255),
    custom_str1: metadata.kind ? String(metadata.kind).slice(0, 255) : "",
    custom_str2: metadata.contributionNumber
      ? String(metadata.contributionNumber).slice(0, 255)
      : metadata.orderId
        ? String(metadata.orderId).slice(0, 255)
        : "",
    custom_str3: metadata.contributionId ? String(metadata.contributionId).slice(0, 255) : "",
    custom_str4: metadata.userId ? String(metadata.userId).slice(0, 255) : "",
    custom_str5: metadata.callbackUrl ? String(metadata.callbackUrl).slice(0, 255) : "",
  };

  fields.signature = generateSignature(fields, config.passphrase || null);

  const query = Object.entries(fields)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

  return {
    reference,
    processUrl: config.processUrl,
    paymentUrl: config.processUrl,
    formFields: fields,
    method: "POST",
    payfastEnvironment: config.sandbox ? "sandbox" : "live",
    authorization_url: `${config.processUrl}?${query}`,
    authorizationUrl: `${config.processUrl}?${query}`,
    returnUrl: effectiveReturnUrl,
    cancelUrl: effectiveCancelUrl,
    notifyUrl: effectiveNotifyUrl,
    amount: formatAmount(amountInMajor),
    currency: upperCurrency,
    email,
  };
};

/** Normalize ITN payload into the shape paymentService settlement expects. */
const normalizeItnPayload = (itnData) => {
  const statusRaw = String(itnData?.payment_status || "").toUpperCase();
  let status = "unknown";
  if (statusRaw === "COMPLETE") status = "success";
  else if (statusRaw === "CANCELLED") status = "cancelled";
  else status = "failed";

  return {
    status,
    amountMajor: Number(itnData?.amount_gross || 0),
    currency: "ZAR",
    id: itnData?.pf_payment_id != null ? String(itnData.pf_payment_id) : null,
    reference: itnData?.m_payment_id || null,
    raw: itnData,
  };
};

/**
 * Full ITN security pipeline: signature → optional IP → server validate → amount.
 */
const processItnNotification = async (
  posted,
  { expectedAmountMajor, orderedEntries = null, paramString = null } = {}
) => {
  if (!posted || typeof posted !== "object") {
    return { valid: false, reason: "empty payload" };
  }

  if (!verifyItnSignature(posted, null, orderedEntries)) {
    return { valid: false, reason: "invalid signature" };
  }

  const itnParamString =
    paramString || buildItnParamString(posted, orderedEntries);
  const serverValid = await validateItnWithPayfast(itnParamString);
  if (!serverValid) {
    return { valid: false, reason: "PayFast server validation failed" };
  }

  if (expectedAmountMajor != null) {
    const gross = Number(posted.amount_gross || 0);
    if (Math.abs(gross - Number(expectedAmountMajor)) > 0.01) {
      return { valid: false, reason: "amount mismatch" };
    }
  }

  return { valid: true, data: normalizeItnPayload(posted) };
};

// ── REST API (refunds, subscriptions, …) ───────────────────────────────────

const phpUrlEncode = (value) =>
  encodeURIComponent(String(value)).replace(/%20/g, "+");

/** Matches PayFast PHP SDK `date("Y-m-d\TH:i:sO")` e.g. 2026-06-23T11:02:00+0200 */
const formatApiTimestamp = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hours = pad(Math.floor(abs / 60));
  const mins = pad(abs % 60);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${hours}${mins}`
  );
};

/**
 * PayFast REST API signature — alphabetically sorted header + body (+ passphrase).
 * The `testing` query param is sent in sandbox but excluded from the signature.
 */
const generateApiSignature = (fields, passphrase = null) => {
  const data = { ...(fields || {}) };
  delete data.signature;
  if (passphrase != null && String(passphrase).trim() !== "") {
    data.passphrase = String(passphrase).trim();
  }
  const keys = Object.keys(data).sort();
  const paramString = keys
    .filter((key) => data[key] !== "" && data[key] != null)
    .map((key) => `${key}=${phpUrlEncode(data[key])}`)
    .join("&");
  return crypto.createHash("md5").update(paramString).digest("hex");
};

const sendApiRequest = async (
  method,
  path,
  { query = null, body = null, responseType = "json" } = {}
) => {
  assertConfigured();
  const config = readConfig();
  const timestamp = formatApiTimestamp();
  const headers = {
    "merchant-id": config.merchantId,
    version: "v1",
    timestamp,
  };

  const queryParams =
    query && typeof query === "object"
      ? Object.fromEntries(
          Object.entries(query).filter(([, v]) => v !== "" && v != null)
        )
      : {};

  const bodyPayload =
    body && typeof body === "object"
      ? Object.fromEntries(
          Object.entries(body).filter(([, v]) => v !== "" && v != null)
        )
      : null;

  // `testing` is sent in sandbox but excluded from the signature (PayFast PHP SDK).
  const signature = generateApiSignature(
    { ...headers, ...queryParams, ...(bodyPayload || {}) },
    config.passphrase || null
  );

  const url = `${PAYFAST_API_BASE}/${String(path).replace(/^\//, "")}`;
  const axiosParams = { ...queryParams };
  if (config.sandbox) axiosParams.testing = "true";

  try {
    const response = await axios({
      method,
      url,
      params: axiosParams,
      data: bodyPayload || undefined,
      headers: {
        ...headers,
        signature,
        accept: responseType === "text" ? "text/csv, text/plain, */*" : "application/json",
        ...(bodyPayload ? { "Content-Type": "application/json" } : {}),
      },
      timeout: 20_000,
      validateStatus: () => true,
      responseType,
    });

    if (responseType === "text") {
      if (response.status >= 400) {
        throw new HttpError(
          `PayFast API failed (HTTP ${response.status})`,
          response.status
        );
      }
      return response.data;
    }

    const data = response.data;
    const httpOk = data?.code === 200 || data?.status === "success";
    const apiOk = data?.data?.response === true || httpOk;
    if (!httpOk && !apiOk) {
      const reason =
        data?.data?.message ||
        data?.message ||
        (typeof data?.data?.response === "string" ? data.data.response : null) ||
        `PayFast API error (HTTP ${data?.code || response.status || "unknown"})`;
      const err = new HttpError(String(reason), data?.code || response.status || 502);
      err.payfastResponse = data;
      throw err;
    }
    return data;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const status = err?.response?.status;
    const bodyData = err?.response?.data;
    const reason =
      bodyData?.data?.message ||
      bodyData?.message ||
      err?.message ||
      "PayFast API request failed";
    const wrapped = new HttpError(
      `PayFast API failed${status ? ` (HTTP ${status})` : ""}: ${reason}`,
      status || 502
    );
    wrapped.payfastResponse = bodyData;
    throw wrapped;
  }
};

/** GET /refunds/:pf_payment_id — refund eligibility and balance. */
const queryRefund = async (pfPaymentId) => {
  if (!pfPaymentId) {
    throw new HttpError("PayFast pf_payment_id is required to query a refund", 400);
  }
  return sendApiRequest("GET", `refunds/${encodeURIComponent(pfPaymentId)}`);
};

/**
 * POST /refunds/:pf_payment_id — create a refund (card refunds to original source).
 * Amount is sent in cents (ZAR). PayFast REST refunds are not supported in sandbox.
 */
const createRefund = async (
  pfPaymentId,
  { amountInMajor, reason, notifyBuyer = true, notifyMerchant = false } = {}
) => {
  if (!pfPaymentId) {
    throw new HttpError("PayFast pf_payment_id is required to create a refund", 400);
  }
  const trimmedReason = String(reason || "Order refund").trim();
  if (trimmedReason.length < 3) {
    throw new HttpError("Refund reason must be at least 3 characters for PayFast", 400);
  }

  const amountCents = Math.round(Number(amountInMajor) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new HttpError("Refund amount must be a positive number", 400);
  }

  const body = {
    amount: amountCents,
    reason: trimmedReason.slice(0, 255),
    notify_buyer: notifyBuyer ? 1 : 0,
    notify_merchant: notifyMerchant ? 1 : 0,
  };

  return sendApiRequest("POST", `refunds/${encodeURIComponent(pfPaymentId)}`, { body });
};

// ── Transaction history (merchant dashboard data via REST API) ───────────────

const formatApiDate = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError("Invalid date for PayFast transaction history", 400);
  }
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const parseCsvLine = (line) => {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((cell) => cell.replace(/^"|"$/g, "").trim());
};

/** Parse PayFast `GET /transactions/history` CSV into row objects. */
const parseTransactionHistoryCsv = (csvText) => {
  const lines = String(csvText || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (name) => headers.indexOf(name.toLowerCase());

  const iType = idx("type");
  const iSign = idx("sign");
  const iGross = idx("gross");
  const iCurrency = idx("currency");
  const iMPaymentId = idx("m payment id");
  const iPfPaymentId = idx("pf payment id");
  const iDate = idx("date");

  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const get = (i) => (i >= 0 && cols[i] != null ? cols[i] : "");
    return {
      date: get(iDate),
      type: get(iType),
      sign: get(iSign),
      gross: get(iGross).replace(/,/g, ""),
      currency: get(iCurrency) || "ZAR",
      mPaymentId: get(iMPaymentId),
      pfPaymentId: get(iPfPaymentId),
      rawLine: line,
    };
  });
};

/**
 * Fetch merchant transaction history for a date range (PayFast dashboard data).
 * @see https://developers.payfast.co.za/api#transaction-history
 */
const getTransactionHistoryRange = async ({
  from,
  to,
  offset = 0,
  limit = 1000,
} = {}) => {
  if (!from || !to) {
    throw new HttpError("from and to dates are required for transaction history", 400);
  }
  const csv = await sendApiRequest("GET", "transactions/history", {
    query: { from, to, offset, limit },
    responseType: "text",
  });
  return parseTransactionHistoryCsv(csv);
};

/**
 * Look up a payment by m_payment_id in PayFast transaction history (not local DB).
 * Used when ITN has not arrived yet but the customer completed checkout.
 */
const lookupTransactionByMerchantPaymentId = async (
  mPaymentId,
  { fromDate, toDate, expectedAmountMajor = null } = {}
) => {
  if (!mPaymentId) {
    throw new HttpError("m_payment_id is required for PayFast lookup", 400);
  }

  const from = formatApiDate(fromDate || new Date());
  const to = formatApiDate(toDate || new Date());
  const rows = await getTransactionHistoryRange({ from, to });
  const ref = String(mPaymentId).trim();

  const match = rows.find((row) => {
    if (String(row.mPaymentId).trim() !== ref) return false;
    if (String(row.type).toUpperCase() !== "FUNDS_RECEIVED") return false;
    if (expectedAmountMajor != null) {
      const gross = Number(row.gross);
      if (Math.abs(gross - Number(expectedAmountMajor)) > 0.01) return false;
    }
    return true;
  });

  if (!match) {
    return { found: false, reason: "no matching transaction in PayFast history" };
  }

  return {
    found: true,
    status: "success",
    row: match,
    data: {
      status: "success",
      amountMajor: Number(match.gross),
      currency: String(match.currency || "ZAR").toUpperCase(),
      id: match.pfPaymentId || null,
      reference: match.mPaymentId,
      raw: match,
    },
  };
};

module.exports = {
  readConfig,
  assertConfigured,
  formatAmount,
  generateSignature,
  buildItnParamString,
  buildItnParamStringFromEntries,
  parseItnRawBody,
  verifyItnSignature,
  validateItnWithPayfast,
  isValidNotifySource,
  initializeTransaction,
  normalizeItnPayload,
  processItnNotification,
  formatApiTimestamp,
  generateApiSignature,
  sendApiRequest,
  queryRefund,
  createRefund,
  formatApiDate,
  parseTransactionHistoryCsv,
  getTransactionHistoryRange,
  lookupTransactionByMerchantPaymentId,
};
