/* eslint-disable no-console */
/**
 * Standalone Brevo (Transactional Email API) smoke-test.
 *
 *   node scripts/testEmail.js                       → sends to BREVO_SENDER_EMAIL
 *   node scripts/testEmail.js admin@example.com     → sends to that address
 *
 * What it does:
 *   1. Loads .env and prints the Brevo config the email service will see
 *      (with the API key masked).
 *   2. Calls GET https://api.brevo.com/v3/account to verify credentials
 *      WITHOUT sending an actual email.
 *   3. Sends a real test email via Brevo and logs the message id (or the
 *      exact error returned by the API).
 *
 * Use this to isolate whether the problem is:
 *   - .env not loading (missing vars)
 *   - Bad / revoked Brevo API key (401)
 *   - Sender email not verified in Brevo (400 from /smtp/email)
 *   - Network outbound HTTPS blocked
 */

require("dotenv").config();
const axios = require("axios");

const RECIPIENT = process.argv[2] || process.env.BREVO_SENDER_EMAIL;

const mask = (s) => {
  if (!s) return "(empty)";
  if (s.length <= 8) return "*".repeat(s.length);
  return s.slice(0, 6) + "*".repeat(s.length - 10) + s.slice(-4);
};

(async () => {
  const cfg = {
    apiKey: process.env.BREVO_API_KEY,
    senderEmail: process.env.BREVO_SENDER_EMAIL,
    senderName:
      process.env.BREVO_SENDER_NAME || process.env.APP_NAME || "Satya",
  };

  console.log("─── Brevo env check ───");
  console.log("BREVO_API_KEY     :", mask(cfg.apiKey), `(length=${cfg.apiKey ? cfg.apiKey.length : 0})`);
  console.log("BREVO_SENDER_EMAIL:", cfg.senderEmail || "(missing)");
  console.log("BREVO_SENDER_NAME :", cfg.senderName);
  console.log("Recipient         :", RECIPIENT);
  console.log("───────────────────────");

  const missing = [];
  if (!cfg.apiKey) missing.push("BREVO_API_KEY");
  if (!cfg.senderEmail) missing.push("BREVO_SENDER_EMAIL");
  if (missing.length) {
    console.error("[X] Missing env vars:", missing.join(", "));
    process.exit(1);
  }
  if (!RECIPIENT) {
    console.error(
      "[X] No recipient. Pass an email address as arg, or set BREVO_SENDER_EMAIL in .env."
    );
    process.exit(1);
  }

  try {
    console.log("\n-> Verifying Brevo credentials (GET /v3/account) ...");
    const { data: account } = await axios.get(
      "https://api.brevo.com/v3/account",
      {
        headers: { "api-key": cfg.apiKey, accept: "application/json" },
        timeout: 10_000,
      }
    );
    console.log("[OK] Brevo verify succeeded.");
    console.log("   email      :", account?.email);
    console.log("   company    :", account?.companyName);
    console.log("   plan       :", JSON.stringify(account?.plan));
  } catch (err) {
    const status = err?.response?.status;
    const body = err?.response?.data;
    console.error(
      "[X] Brevo verify failed:",
      status ? `HTTP ${status}` : err.message,
      body || ""
    );
    console.error(
      "\nMost common causes:\n" +
        "  - BREVO_API_KEY is wrong / revoked (401)\n" +
        "  - You copied the SMTP key instead of the Transactional API key\n" +
        "  - Outbound HTTPS to api.brevo.com is blocked by your network"
    );
    process.exit(1);
  }

  try {
    console.log("\n-> Sending test email via Brevo ...");
    const { data } = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: { email: cfg.senderEmail, name: cfg.senderName },
        to: [{ email: RECIPIENT }],
        subject: "Satya Brevo test [OK]",
        textContent:
          "If you're reading this, your Brevo API key works and the backend can deliver " +
          "admin invitations + order emails. Nothing else is required.",
        htmlContent:
          "<p>If you're reading this, your Brevo API key works and the backend can deliver " +
          "admin invitations + order emails. Nothing else is required.</p>",
      },
      {
        headers: {
          "api-key": cfg.apiKey,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        timeout: 15_000,
      }
    );
    console.log("[OK] Sent.");
    console.log("   messageId :", data?.messageId);
    console.log(`\nNow check the inbox of ${RECIPIENT} (and the Spam folder).`);
    process.exit(0);
  } catch (err) {
    const status = err?.response?.status;
    const body = err?.response?.data;
    console.error(
      "[X] sendMail failed:",
      status ? `HTTP ${status}` : err.message,
      body || ""
    );
    if (body?.code === "unauthorized") {
      console.error(
        "\n[?] Your sender email is probably not verified in Brevo. Go to\n" +
          "   https://app.brevo.com/senders/list and add / verify\n" +
          `   "${cfg.senderEmail}" before retrying.`
      );
    }
    process.exit(1);
  }
})();
