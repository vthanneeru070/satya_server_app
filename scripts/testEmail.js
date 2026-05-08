/* eslint-disable no-console */
/**
 * Standalone SMTP smoke-test.
 *
 *   node scripts/testEmail.js                       → sends to SMTP_USER (yourself)
 *   node scripts/testEmail.js admin@example.com     → sends to that address
 *
 * What it does:
 *   1. Loads .env and prints what the email service will see (with the password masked).
 *   2. Builds the transporter with the same options as src/services/emailService.js.
 *   3. Calls transporter.verify() to check connectivity & credentials WITHOUT sending.
 *   4. Sends a real test email and logs the SMTP server response (or the exact error).
 *
 * Use this to isolate whether the problem is:
 *   - .env not loading (missing vars)
 *   - Bad credentials (Gmail rejects auth)
 *   - Network/firewall (port 587 blocked outbound)
 *   - Something else entirely (server response will tell us)
 */

require("dotenv").config();
const nodemailer = require("nodemailer");

const RECIPIENT = process.argv[2] || process.env.SMTP_USER;

const mask = (s) => {
  if (!s) return "(empty)";
  if (s.length <= 4) return "*".repeat(s.length);
  return s.slice(0, 2) + "*".repeat(s.length - 4) + s.slice(-2);
};

(async () => {
  const cfg = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  };

  console.log("─── SMTP env check ───");
  console.log("SMTP_HOST  :", cfg.host || "(missing)");
  console.log("SMTP_PORT  :", cfg.port);
  console.log("SMTP_SECURE:", cfg.secure);
  console.log("SMTP_USER  :", cfg.user || "(missing)");
  console.log("SMTP_PASS  :", mask(cfg.pass), `(length=${cfg.pass ? cfg.pass.length : 0})`);
  console.log("SMTP_FROM  :", cfg.from || "(falls back to SMTP_USER)");
  console.log("Recipient  :", RECIPIENT);
  console.log("──────────────────────");

  const missing = [];
  if (!cfg.host) missing.push("SMTP_HOST");
  if (!cfg.user) missing.push("SMTP_USER");
  if (!cfg.pass) missing.push("SMTP_PASS");
  if (missing.length) {
    console.error("❌ Missing env vars:", missing.join(", "));
    process.exit(1);
  }
  if (!RECIPIENT) {
    console.error(
      "❌ No recipient. Pass an email address as arg, or set SMTP_USER in .env."
    );
    process.exit(1);
  }

  // Gmail App Passwords are 16 chars with no spaces. If we see spaces or wrong
  // length, it's almost certainly the cause of a 535 auth failure.
  if (cfg.host.includes("gmail")) {
    if (cfg.pass.includes(" ")) {
      console.warn(
        "⚠️  SMTP_PASS contains spaces. Gmail App Passwords must be entered as 16 continuous characters. Remove the spaces in .env."
      );
    }
    if (cfg.pass.length !== 16) {
      console.warn(
        `⚠️  SMTP_PASS is ${cfg.pass.length} chars long. Gmail App Passwords are exactly 16 chars. If yours isn't, regenerate one at https://myaccount.google.com/apppasswords`
      );
    }
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    requireTLS: !cfg.secure && cfg.port === 587,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    logger: true,
    debug: true,
  });

  try {
    console.log("\n→ Verifying SMTP connection & credentials …");
    await transporter.verify();
    console.log("✅ SMTP verify succeeded.");
  } catch (err) {
    console.error("❌ SMTP verify failed:", err.message);
    if (err.code) console.error("   code:", err.code);
    if (err.response) console.error("   server response:", err.response);
    console.error(
      "\nMost common causes:\n" +
        "  • Gmail App Password wrong / has spaces / not generated under same account\n" +
        "  • 2-Step Verification not enabled on the Gmail account (App Passwords need it)\n" +
        "  • Outbound port 587 blocked by your network or firewall\n" +
        "  • SMTP_SECURE / SMTP_PORT mismatch (587 = false, 465 = true)"
    );
    process.exit(1);
  }

  try {
    console.log("\n→ Sending test email …");
    const info = await transporter.sendMail({
      from: cfg.from || `"Satya Test" <${cfg.user}>`,
      to: RECIPIENT,
      subject: "Satya SMTP test ✔",
      text:
        "If you're reading this, your SMTP credentials work and the backend can deliver " +
        "admin invitations. Nothing else is required.",
      html:
        "<p>If you're reading this, your SMTP credentials work and the backend can deliver " +
        "admin invitations. Nothing else is required.</p>",
    });
    console.log("✅ Sent.");
    console.log("   messageId :", info.messageId);
    console.log("   accepted  :", info.accepted);
    console.log("   rejected  :", info.rejected);
    console.log("   response  :", info.response);
    console.log(`\nNow check the inbox of ${RECIPIENT} (and the Spam folder).`);
    process.exit(0);
  } catch (err) {
    console.error("❌ sendMail failed:", err.message);
    if (err.code) console.error("   code:", err.code);
    if (err.response) console.error("   server response:", err.response);
    process.exit(1);
  }
})();
