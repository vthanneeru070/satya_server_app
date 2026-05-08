// Ensure dotenv is loaded before reading process.env. Safe to call multiple times.
require("dotenv").config();

const dns = require("dns");
const nodemailer = require("nodemailer");
const axios = require("axios");

// Force the entire process to prefer IPv4 for DNS resolution. Many cloud hosts
// (Render, some Heroku dynos) advertise IPv6 in their resolver but have no IPv6
// outbound routing, which causes ENETUNREACH errors when nodemailer picks the
// AAAA record for smtp.gmail.com first. This is a process-wide setting (Node 18+).
try {
  dns.setDefaultResultOrder("ipv4first");
} catch (_) {
  // older Node — ignore.
}

let cachedTransporter = null;
let cachedSignature = null;

/**
 * Send an email via Resend's HTTPS API.
 *
 * Why Resend: cloud hosts like Render block outbound SMTP (ports 25 / 465 / 587),
 * but they allow HTTPS to api.resend.com. Resend offers a free tier (3000/mo,
 * 100/day) and only needs a single API key — no domain verification required
 * if you send from the shared "onboarding@resend.dev" sender.
 *
 * Returns the same shape as sendMail() so callers don't care which transport
 * was used.
 */
const sendViaResend = async ({ to, subject, html, text, from }) => {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress =
    from ||
    process.env.RESEND_FROM ||
    process.env.SMTP_FROM ||
    "onboarding@resend.dev";

  try {
    const { data } = await axios.post(
      "https://api.resend.com/emails",
      { from: fromAddress, to: [to], subject, html, text },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 15_000,
      }
    );
    console.log(
      `[emailService] (resend) Sent mail id=${data?.id} from=${fromAddress} to=${to}`
    );
    return {
      dryRun: false,
      delivered: true,
      messageId: data?.id || null,
      accepted: [to],
      rejected: [],
      response: "resend-api",
      provider: "resend",
    };
  } catch (err) {
    const status = err?.response?.status;
    const body = err?.response?.data;
    const reason =
      body?.message || body?.error || err?.message || "Unknown Resend error";
    const wrapped = new Error(
      `Resend API failed${status ? ` (HTTP ${status})` : ""}: ${reason}`
    );
    wrapped.code = body?.name || err?.code || "RESEND_ERROR";
    wrapped.response = JSON.stringify(body || {});
    throw wrapped;
  }
};

/**
 * Read SMTP config LAZILY from process.env every call. This is critical because
 * if this module is `require()`-d before dotenv has populated process.env, a
 * top-level destructure would freeze the values as `undefined` for the lifetime
 * of the process — which is exactly the bug we hit.
 */
const readSmtpConfig = () => {
  const cfg = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
    appName: process.env.APP_NAME || "Satya",
    panelUrl: process.env.ADMIN_PANEL_URL,
    debug: String(process.env.SMTP_DEBUG).toLowerCase() === "true",
  };
  if (cfg.pass) cfg.pass = cfg.pass.replace(/^["']|["']$/g, "");
  if (cfg.from) cfg.from = cfg.from.replace(/^["']|["']$/g, "");
  return cfg;
};

const isPlaceholder = (value) => {
  if (!value) return true;
  const v = String(value).toLowerCase();
  return (
    v.startsWith("your-") ||
    v.includes("placeholder") ||
    v.includes("example.com") ||
    v === "your-mailer@gmail.com" ||
    v === "your-gmail-app-password-16-chars"
  );
};

/**
 * Build / reuse the SMTP transporter. Returns null when SMTP is not configured
 * or still has the placeholder values from .env.example, in which case calls
 * fall back to dry-run (logged) mode.
 */
const getTransporter = () => {
  const cfg = readSmtpConfig();
  // If config changes (e.g. server reload picks new env vars), rebuild.
  const signature = `${cfg.host}|${cfg.user}|${cfg.pass}|${cfg.port}|${cfg.secure}`;
  if (cachedTransporter && cachedSignature === signature) return cachedTransporter;

  const missing = [];
  if (!cfg.host) missing.push("SMTP_HOST");
  if (!cfg.user) missing.push("SMTP_USER");
  if (!cfg.pass) missing.push("SMTP_PASS");
  if (missing.length) {
    console.warn(
      `[emailService] Missing SMTP env vars: ${missing.join(", ")}. Emails will run in DRY-RUN mode.`
    );
    return null;
  }

  if (isPlaceholder(cfg.user) || isPlaceholder(cfg.pass)) {
    console.warn(
      `[emailService] SMTP_USER / SMTP_PASS look like placeholder values (current SMTP_USER="${cfg.user}"). Replace them with real credentials. DRY-RUN mode active.`
    );
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    requireTLS: !cfg.secure && cfg.port === 587,
    auth: { user: cfg.user, pass: cfg.pass },
    // Force IPv4. Many cloud hosts (Render, some Heroku dynos) have no IPv6
    // outbound routing, and Gmail publishes both A and AAAA records — Node would
    // otherwise pick IPv6 first and crash with ENETUNREACH.
    family: 4,
    // Hard timeouts so a hung SMTP server can never block the API response.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    pool: true,
    maxConnections: 3,
    debug: cfg.debug,
    logger: cfg.debug,
  });
  cachedSignature = signature;
  console.log(
    `[emailService] SMTP transporter ready: host=${cfg.host} port=${cfg.port} secure=${cfg.secure} user=${cfg.user}`
  );
  return cachedTransporter;
};

/**
 * Send an email. Transport selection (in priority order):
 *   1. Resend HTTPS API   ← if RESEND_API_KEY is set (works on Render / any cloud host)
 *   2. SMTP (nodemailer)  ← if SMTP_HOST/USER/PASS are set
 *   3. Dry-run            ← otherwise (local dev convenience; logs the email content)
 *
 * Returns:
 *   { delivered: true,  dryRun: false, messageId, accepted, rejected, response, provider }
 *   { delivered: false, dryRun: true }                                          ← no transport
 */
const sendMail = async ({ to, subject, html, text }) => {
  // 1) Prefer Resend on hosts that block SMTP.
  if (process.env.RESEND_API_KEY) {
    return sendViaResend({ to, subject, html, text });
  }

  // 2) SMTP fallback.
  const cfg = readSmtpConfig();
  const transporter = getTransporter();
  if (!transporter) {
    console.log("──────── [emailService DRY-RUN] ────────");
    console.log("To:", to);
    console.log("Subject:", subject);
    console.log("Text preview:", String(text).slice(0, 500));
    console.log("────────────────────────────────────────");
    return { dryRun: true, delivered: false };
  }

  const from = cfg.from || `"${cfg.appName}" <${cfg.user}>`;
  const info = await transporter.sendMail({ from, to, subject, html, text });
  console.log(
    `[emailService] (smtp) Sent mail messageId=${info.messageId} accepted=${JSON.stringify(info.accepted)} rejected=${JSON.stringify(info.rejected)}`
  );
  return {
    dryRun: false,
    delivered: true,
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response,
    provider: "smtp",
  };
};

/**
 * Test SMTP connectivity / credentials WITHOUT sending an actual email.
 * Returns `{ ok: true }` on success, `{ ok: false, error }` otherwise.
 */
const verifyTransport = async () => {
  const transporter = getTransporter();
  if (!transporter) return { ok: false, error: "SMTP not configured" };
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};

const buildAdminInviteHtml = ({ fullName, resetLink, panelUrl, appName }) => `
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Admin Invitation</title></head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f6fa;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:28px 32px;color:#fff;">
            <div style="font-size:13px;letter-spacing:1.5px;opacity:0.85;">${appName.toUpperCase()} ADMIN PANEL</div>
            <div style="font-size:22px;font-weight:600;margin-top:8px;">You've been invited as an admin</div>
          </td>
        </tr>

        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Hi <strong>${fullName || "there"}</strong>,</p>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
            A super-admin has created an admin account for you on <strong>${appName}</strong>.
            To finish setting up, click the button below to choose your password.
          </p>

          <div style="text-align:center;margin:28px 0;">
            <a href="${resetLink}"
               style="background:#4f46e5;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block;">
              Set Your Password
            </a>
          </div>

          <p style="margin:18px 0 6px;font-size:13px;color:#6b7280;line-height:1.5;">
            Or copy and paste this URL into your browser:
          </p>
          <p style="margin:0 0 18px;font-size:12px;word-break:break-all;background:#f3f4f6;padding:10px 12px;border-radius:6px;color:#374151;">
            ${resetLink}
          </p>

          <p style="margin:22px 0 6px;font-size:13px;color:#6b7280;line-height:1.5;">
            <strong>Heads up:</strong> this link expires in roughly 1 hour. After you set your password,
            ${panelUrl
              ? `sign in to the admin panel at <a href="${panelUrl}" style="color:#4f46e5;">${panelUrl}</a>.`
              : "sign in to the admin panel using your email and the new password."}
          </p>

          <p style="margin:18px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
            If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </td></tr>

        <tr>
          <td style="background:#f9fafb;padding:18px 32px;text-align:center;font-size:12px;color:#9ca3af;">
            ${appName} · This is an automated message; please do not reply.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const buildAdminInviteText = ({ fullName, resetLink, panelUrl, appName }) =>
  [
    `Hi ${fullName || "there"},`,
    ``,
    `A super-admin has created an admin account for you on ${appName}.`,
    `Click the link below to set your password:`,
    ``,
    resetLink,
    ``,
    `This link expires in about 1 hour.`,
    panelUrl ? `After resetting, sign in at: ${panelUrl}` : "",
    ``,
    `If you didn't expect this email, please ignore it.`,
    `— ${appName}`,
  ]
    .filter(Boolean)
    .join("\n");

const sendAdminInviteEmail = async ({ to, fullName, resetLink, panelUrl }) => {
  const cfg = readSmtpConfig();
  const subject = `You've been invited as an admin on ${cfg.appName}`;
  const params = {
    fullName,
    resetLink,
    panelUrl: panelUrl || cfg.panelUrl,
    appName: cfg.appName,
  };
  return sendMail({
    to,
    subject,
    html: buildAdminInviteHtml(params),
    text: buildAdminInviteText(params),
  });
};

const sendPasswordResetEmail = async ({ to, fullName, resetLink, panelUrl }) => {
  const cfg = readSmtpConfig();
  const subject = `Reset your ${cfg.appName} admin password`;
  const params = {
    fullName,
    resetLink,
    panelUrl: panelUrl || cfg.panelUrl,
    appName: cfg.appName,
  };
  return sendMail({
    to,
    subject,
    html: buildAdminInviteHtml(params),
    text: buildAdminInviteText(params),
  });
};

module.exports = {
  sendMail,
  sendAdminInviteEmail,
  sendPasswordResetEmail,
  verifyTransport,
};
