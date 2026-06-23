/**
 * Public payment redirect landing pages.
 *
 * PayFast redirects the browser/WebView to `PAYFAST_RETURN_URL` after a
 * payment attempt. Settlement happens server-side via ITN and the client may
 * call GET /api/v1/payments/verify/:reference once ITN has processed.
 */

const express = require("express");

const router = express.Router();

const escape = (value) =>
  String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderPage = ({ title, headline, body, status }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: linear-gradient(180deg, #f6f8fb 0%, #eef1f6 100%);
    color: #1f2937;
    padding: 24px;
  }
  @media (prefers-color-scheme: dark) {
    body { background: linear-gradient(180deg, #0f172a 0%, #111827 100%); color: #e5e7eb; }
    .card { background: #111827; border-color: #1f2937; box-shadow: 0 8px 30px rgba(0,0,0,0.5); }
    .meta { color: #9ca3af; }
  }
  .card {
    width: 100%;
    max-width: 460px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    padding: 32px 28px;
    box-shadow: 0 8px 30px rgba(15, 23, 42, 0.08);
    text-align: center;
  }
  .icon {
    width: 80px; height: 80px;
    border-radius: 50%;
    display: grid; place-items: center;
    margin: 0 auto 18px;
    font-size: 40px;
    color: white;
  }
  .icon.success { background: #16a34a; }
  .icon.failed  { background: #dc2626; }
  h1 { margin: 0 0 8px; font-size: 22px; }
  p  { margin: 4px 0; line-height: 1.5; }
  .meta { color: #6b7280; font-size: 14px; word-break: break-all; }
  .pill {
    display: inline-block; padding: 4px 10px; border-radius: 999px;
    font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase;
    margin-top: 6px;
  }
  .pill.success { background: rgba(22,163,74,0.12); color: #16a34a; }
  .pill.failed  { background: rgba(220,38,38,0.12); color: #dc2626; }
  .hint { margin-top: 22px; font-size: 14px; color: #6b7280; }
</style>
</head>
<body>
  <main class="card">
    <div class="icon ${status === "success" ? "success" : "failed"}" aria-hidden="true">${
  status === "success" ? "&#10003;" : "&#10005;"
}</div>
    <h1>${escape(headline)}</h1>
    <span class="pill ${status === "success" ? "success" : "failed"}">${escape(status)}</span>
    <div style="margin-top: 14px">${body}</div>
    <p class="hint">You can safely close this window and return to the app.</p>
  </main>
</body>
</html>`;

router.get("/payment-success", (req, res) => {
  const reference =
    req.query.m_payment_id || req.query.reference || req.query.trxref || "";
  const body = `
    <p>Your payment was received.</p>
    ${reference ? `<p class="meta">Reference: ${escape(reference)}</p>` : ""}
  `;
  return res
    .status(200)
    .set("Content-Type", "text/html; charset=utf-8")
    .send(
      renderPage({
        title: "Payment successful",
        headline: "Payment successful",
        status: "success",
        body,
      })
    );
});

router.get("/payment-failed", (req, res) => {
  const reference =
    req.query.m_payment_id || req.query.reference || req.query.trxref || "";
  const body = `
    <p>Your payment was not completed.</p>
    ${reference ? `<p class="meta">Reference: ${escape(reference)}</p>` : ""}
  `;
  return res
    .status(200)
    .set("Content-Type", "text/html; charset=utf-8")
    .send(
      renderPage({
        title: "Payment not completed",
        headline: "Payment not completed",
        status: "failed",
        body,
      })
    );
});

module.exports = router;
