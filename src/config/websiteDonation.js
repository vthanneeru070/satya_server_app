/**
 * Public website donation configuration.
 *
 * Recipient / contact copy is env-driven so we never invent legal details.
 * Leave placeholders empty until the business supplies verified text.
 */

const DEFAULT_WEBSITE_URL = "https://www.sathya.co.za";

const readWebsiteUrl = () =>
  String(process.env.WEBSITE_URL || DEFAULT_WEBSITE_URL).trim().replace(/\/$/, "");

/**
 * Env sometimes points return/cancel at the website origin only. PayFast must
 * land on the Flutter success/cancel routes, never the bare homepage.
 */
const normalizeWebsiteDonationLandingUrl = (raw, fallbackPath) => {
  const websiteUrl = readWebsiteUrl();
  const fallback = `${websiteUrl}${fallbackPath}`;
  const value = String(raw || "").trim();
  if (!value) return fallback;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return fallback;
  }

  const path = (parsed.pathname || "/").replace(/\/+$/, "") || "/";
  if (path === "/") {
    return fallback;
  }

  // Keep query/hash (e.g. from=app) but drop a trailing slash on the path.
  parsed.pathname = path;
  return parsed.toString();
};

const readDonationPublicConfig = () => {
  const websiteUrl = readWebsiteUrl();
  return {
    websiteUrl,
    currency: "ZAR",
    minAmount: 10,
    maxAmount: 1_000_000,
    suggestedAmounts: [50, 100, 250, 500],
    recipientName:
      String(process.env.DONATION_RECIPIENT_NAME || "").trim() ||
      "[CONFIGURE: DONATION_RECIPIENT_NAME]",
    donationPurpose:
      String(process.env.DONATION_PURPOSE || "").trim() ||
      "[CONFIGURE: DONATION_PURPOSE]",
    contactEmail:
      String(process.env.DONATION_CONTACT_EMAIL || "").trim() ||
      "[CONFIGURE: DONATION_CONTACT_EMAIL]",
    contactPhone: String(process.env.DONATION_CONTACT_PHONE || "").trim() || null,
    returnUrl: normalizeWebsiteDonationLandingUrl(
      process.env.WEBSITE_DONATION_RETURN_URL,
      "/donate/success"
    ),
    cancelUrl: normalizeWebsiteDonationLandingUrl(
      process.env.WEBSITE_DONATION_CANCEL_URL,
      "/donate/cancelled"
    ),
    /** True when recipient placeholders are still unset. */
    configIncomplete: !(
      process.env.DONATION_RECIPIENT_NAME &&
      process.env.DONATION_PURPOSE &&
      process.env.DONATION_CONTACT_EMAIL
    ),
  };
};

/**
 * Allow only HTTPS return/cancel URLs on the configured Sathya website origin
 * (or the API payment landing pages as a fallback).
 */
const isAllowedWebsiteDonationRedirect = (url) => {
  if (!url) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;

  const websiteOrigin = new URL(readWebsiteUrl()).origin.toLowerCase();
  const origin = parsed.origin.toLowerCase();
  if (origin === websiteOrigin) return true;

  // Existing API HTML landings (legacy mobile / fallback).
  const apiHosts = [
    "https://api.sathya.co.za",
    "https://api-test.sathya.co.za",
  ];
  if (apiHosts.includes(origin)) {
    return (
      parsed.pathname === "/payment-success" ||
      parsed.pathname === "/payment-failed"
    );
  }
  return false;
};

module.exports = {
  readWebsiteUrl,
  readDonationPublicConfig,
  isAllowedWebsiteDonationRedirect,
  normalizeWebsiteDonationLandingUrl,
  DEFAULT_WEBSITE_URL,
};
