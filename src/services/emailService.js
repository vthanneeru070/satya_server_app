// Ensure dotenv is loaded before reading process.env. Safe to call multiple times.
require("dotenv").config();

const axios = require("axios");

/**
 * Email transport — Brevo (formerly Sendinblue) Transactional Email HTTPS API.
 *
 * Why Brevo (and why HTTPS, not SMTP):
 *   - Cloud hosts like Render block outbound SMTP (ports 25 / 465 / 587).
 *   - Brevo exposes a simple HTTPS API at https://api.brevo.com/v3/smtp/email.
 *   - Free tier: 300 emails/day. Single API key, no extra setup beyond a
 *     verified sender email / domain.
 *
 * Env vars (read lazily so dotenv ordering doesn't bite us):
 *   BREVO_API_KEY        ← required (xkeysib-…)
 *   BREVO_SENDER_EMAIL   ← required sender address (must be verified in Brevo)
 *   BREVO_SENDER_NAME    ← optional, defaults to APP_NAME or "Satya"
 *
 *   APP_NAME             ← brand name used in email templates
 *   ADMIN_PANEL_URL      ← link shown in admin invite / password reset
 *
 * If BREVO_API_KEY or BREVO_SENDER_EMAIL is missing/placeholder, sendMail()
 * falls back to DRY-RUN (logs the email content) so local development never
 * blocks on missing credentials.
 */

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

const readBrevoConfig = () => {
  const apiKey = (process.env.BREVO_API_KEY || "").trim();
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || "").trim();
  const senderName = (
    process.env.BREVO_SENDER_NAME ||
    process.env.APP_NAME ||
    "Satya"
  ).trim();
  const appName = (process.env.APP_NAME || "Satya").trim();
  const panelUrl = process.env.ADMIN_PANEL_URL || "";
  return { apiKey, senderEmail, senderName, appName, panelUrl };
};

const isPlaceholder = (value) => {
  if (!value) return true;
  const v = String(value).toLowerCase();
  return (
    v.startsWith("your-") ||
    v.includes("placeholder") ||
    v.includes("example.com") ||
    v === "xkeysib-your-brevo-api-key"
  );
};

const isBrevoConfigured = () => {
  const cfg = readBrevoConfig();
  if (!cfg.apiKey || isPlaceholder(cfg.apiKey)) return false;
  if (!cfg.senderEmail || isPlaceholder(cfg.senderEmail)) return false;
  return true;
};

/**
 * Accepts either a plain "addr@example.com" string or a display-name form
 * `"Some Name <addr@example.com>"` and returns Brevo's `{ email, name? }`
 * recipient object. Returns null when the input has no usable email.
 */
const parseRecipient = (raw) => {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(.*)<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].trim().replace(/^["']|["']$/g, "");
    const email = match[2].trim();
    if (!email.includes("@")) return null;
    return name ? { email, name } : { email };
  }

  if (!trimmed.includes("@")) return null;
  return { email: trimmed };
};

/**
 * Send an email through Brevo's HTTPS API.
 * Returns the same shape sendMail() promises so callers don't care about
 * the underlying transport.
 */
const sendViaBrevo = async ({ to, subject, html, text }) => {
  const cfg = readBrevoConfig();

  const recipient = parseRecipient(to);
  if (!recipient) {
    throw new Error(`Invalid recipient email: "${to}"`);
  }

  const payload = {
    sender: { email: cfg.senderEmail, name: cfg.senderName },
    to: [recipient],
    subject,
    htmlContent: html,
    textContent: text,
  };

  try {
    const { data } = await axios.post(BREVO_ENDPOINT, payload, {
      headers: {
        "api-key": cfg.apiKey,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      timeout: 15_000,
    });

    const messageId = data?.messageId || null;
    console.log(
      `[emailService] (brevo) Sent mail id=${messageId} from=${cfg.senderEmail} to=${recipient.email}`
    );
    return {
      dryRun: false,
      delivered: true,
      messageId,
      accepted: [recipient.email],
      rejected: [],
      response: "brevo-api",
      provider: "brevo",
    };
  } catch (err) {
    const status = err?.response?.status;
    const body = err?.response?.data;
    const reason =
      body?.message || body?.code || err?.message || "Unknown Brevo error";
    const wrapped = new Error(
      `Brevo API failed${status ? ` (HTTP ${status})` : ""}: ${reason}`
    );
    wrapped.code = body?.code || err?.code || "BREVO_ERROR";
    wrapped.response = JSON.stringify(body || {});
    throw wrapped;
  }
};

/**
 * Public send function. Either calls Brevo or falls back to DRY-RUN logging
 * when the service isn't configured (so local dev keeps working).
 *
 * Returns:
 *   { delivered: true,  dryRun: false, messageId, accepted, rejected, response, provider }
 *   { delivered: false, dryRun: true }     ← when not configured
 */
const sendMail = async ({ to, subject, html, text }) => {
  if (!isBrevoConfigured()) {
    console.log("──────── [emailService DRY-RUN] ────────");
    console.log("To:", to);
    console.log("Subject:", subject);
    console.log("Text preview:", String(text || "").slice(0, 500));
    console.log(
      "Reason: BREVO_API_KEY and/or BREVO_SENDER_EMAIL are missing — configure them in .env to actually send."
    );
    console.log("────────────────────────────────────────");
    return { dryRun: true, delivered: false };
  }
  return sendViaBrevo({ to, subject, html, text });
};

/**
 * Lightweight transport health check — pings Brevo `GET /v3/account` with the
 * configured API key. Returns `{ ok: true, account }` on success.
 *
 * Useful for an admin "test email" endpoint or boot-time sanity check.
 */
const verifyTransport = async () => {
  const cfg = readBrevoConfig();
  if (!cfg.apiKey || isPlaceholder(cfg.apiKey)) {
    return { ok: false, error: "BREVO_API_KEY is missing or placeholder" };
  }
  if (!cfg.senderEmail || isPlaceholder(cfg.senderEmail)) {
    return { ok: false, error: "BREVO_SENDER_EMAIL is missing or placeholder" };
  }
  try {
    const { data } = await axios.get("https://api.brevo.com/v3/account", {
      headers: { "api-key": cfg.apiKey, accept: "application/json" },
      timeout: 10_000,
    });
    return {
      ok: true,
      account: {
        email: data?.email,
        companyName: data?.companyName,
        plan: data?.plan,
      },
    };
  } catch (err) {
    const status = err?.response?.status;
    const body = err?.response?.data;
    return {
      ok: false,
      error: `Brevo verify failed${status ? ` (HTTP ${status})` : ""}: ${
        body?.message || err?.message
      }`,
    };
  }
};

// ── HTML templates (admin invites & password resets) ──────────────────────

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
  const cfg = readBrevoConfig();
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
  const cfg = readBrevoConfig();
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
  _internal: { readBrevoConfig, parseRecipient, isBrevoConfigured },
};
