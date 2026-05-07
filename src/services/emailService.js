const nodemailer = require("nodemailer");

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  APP_NAME = "Satya",
  ADMIN_PANEL_URL,
} = process.env;

let cachedTransporter = null;

/**
 * Lazily build the SMTP transporter. If SMTP env vars are missing we return
 * null so that calls fall back to a "dry-run" mode (log the email instead of
 * sending) — this keeps dev/local boots from crashing.
 */
const getTransporter = () => {
  if (cachedTransporter) return cachedTransporter;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn(
      "[emailService] SMTP_HOST / SMTP_USER / SMTP_PASS are not all set. Emails will be logged in DRY-RUN mode only."
    );
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: String(SMTP_SECURE).toLowerCase() === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return cachedTransporter;
};

/**
 * Low-level: send an email with optional HTML + text bodies.
 * Returns `{ dryRun: true }` when SMTP is not configured.
 */
const sendMail = async ({ to, subject, html, text }) => {
  const transporter = getTransporter();
  if (!transporter) {
    console.log("──────── [emailService DRY-RUN] ────────");
    console.log("To:", to);
    console.log("Subject:", subject);
    console.log("Text:", text);
    console.log("────────────────────────────────────────");
    return { dryRun: true };
  }

  const from = SMTP_FROM || `"${APP_NAME}" <${SMTP_USER}>`;
  return transporter.sendMail({ from, to, subject, html, text });
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

/**
 * High-level: send the admin invite email containing the password-reset link.
 */
const sendAdminInviteEmail = async ({ to, fullName, resetLink, panelUrl }) => {
  const subject = `You've been invited as an admin on ${APP_NAME}`;
  const html = buildAdminInviteHtml({
    fullName,
    resetLink,
    panelUrl: panelUrl || ADMIN_PANEL_URL,
    appName: APP_NAME,
  });
  const text = buildAdminInviteText({
    fullName,
    resetLink,
    panelUrl: panelUrl || ADMIN_PANEL_URL,
    appName: APP_NAME,
  });
  return sendMail({ to, subject, html, text });
};

/**
 * High-level: re-send the password-reset email (used for "forgot password",
 * "resend invite", etc.).
 */
const sendPasswordResetEmail = async ({ to, fullName, resetLink, panelUrl }) => {
  const subject = `Reset your ${APP_NAME} admin password`;
  const html = buildAdminInviteHtml({
    fullName,
    resetLink,
    panelUrl: panelUrl || ADMIN_PANEL_URL,
    appName: APP_NAME,
  });
  const text = buildAdminInviteText({
    fullName,
    resetLink,
    panelUrl: panelUrl || ADMIN_PANEL_URL,
    appName: APP_NAME,
  });
  return sendMail({ to, subject, html, text });
};

module.exports = {
  sendMail,
  sendAdminInviteEmail,
  sendPasswordResetEmail,
};
