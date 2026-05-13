const Counter = require("../models/Counter");
const { uploadFile } = require("./s3Service");

const INVOICE_PREFIX = process.env.INVOICE_NUMBER_PREFIX || "INV";

/**
 * Next sequential invoice number. Uses the shared `Counter` collection with a
 * dedicated `_id: "invoiceSequence"` so it never collides with order / donation /
 * request counters. First call returns `<PREFIX>-10001`.
 */
const nextInvoiceNumber = async () => {
  const doc = await Counter.findOneAndUpdate(
    { _id: "invoiceSequence" },
    [{ $set: { seq: { $add: [{ $ifNull: ["$seq", 10000] }, 1] } } }],
    { new: true, upsert: true, updatePipeline: true }
  );
  return `${INVOICE_PREFIX}-${doc.seq}`;
};

const escapeHtml = (value) => {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const formatMoney = (amount, currency = "ZAR") => {
  const safe = Number(amount || 0);
  return `${escapeHtml(currency)} ${safe.toFixed(2)}`;
};

const formatDate = (date) => {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

const formatAddress = (addr) => {
  if (!addr) return "—";
  const parts = [
    addr.fullName,
    addr.phone,
    addr.addressLine1,
    [addr.city, addr.state].filter(Boolean).join(", "),
    addr.postalCode,
    addr.country,
  ].filter((piece) => piece && String(piece).trim().length > 0);
  return parts.map(escapeHtml).join("<br/>");
};

const buildInvoiceHtml = ({ order, invoiceNumber, appName }) => {
  const items = (order.items || [])
    .map(
      (line) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(line.title)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${escapeHtml(line.quantity)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatMoney(line.price, order.currency)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatMoney(line.lineTotal, order.currency)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Invoice ${escapeHtml(invoiceNumber)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f6fa;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);">

        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:24px 28px;color:#fff;">
            <div style="font-size:13px;letter-spacing:1.5px;opacity:0.85;">${escapeHtml(appName)} INVOICE</div>
            <div style="font-size:22px;font-weight:600;margin-top:6px;">Invoice ${escapeHtml(invoiceNumber)}</div>
            <div style="font-size:13px;opacity:0.85;margin-top:4px;">Order ${escapeHtml(order.orderNumber)} · ${escapeHtml(formatDate(order.createdAt))}</div>
          </td>
        </tr>

        <tr><td style="padding:24px 28px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="vertical-align:top;width:50%;padding-right:12px;">
                <div style="font-size:12px;text-transform:uppercase;color:#6b7280;letter-spacing:1px;margin-bottom:6px;">Billed to</div>
                <div style="font-size:14px;line-height:1.5;">${formatAddress(order.shippingAddress)}</div>
              </td>
              <td style="vertical-align:top;width:50%;padding-left:12px;">
                <div style="font-size:12px;text-transform:uppercase;color:#6b7280;letter-spacing:1px;margin-bottom:6px;">Payment</div>
                <div style="font-size:14px;line-height:1.5;">
                  Status: <strong>${escapeHtml(order.paymentStatus)}</strong><br/>
                  Method: ${escapeHtml(order.paymentMethod)}<br/>
                  Reference: ${escapeHtml(order.paystackReference || order.orderNumber)}
                </div>
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;border-collapse:collapse;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th align="left" style="padding:10px 12px;font-size:12px;letter-spacing:1px;color:#374151;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Item</th>
                <th align="center" style="padding:10px 12px;font-size:12px;letter-spacing:1px;color:#374151;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Qty</th>
                <th align="right" style="padding:10px 12px;font-size:12px;letter-spacing:1px;color:#374151;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Unit</th>
                <th align="right" style="padding:10px 12px;font-size:12px;letter-spacing:1px;color:#374151;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${items || `<tr><td colspan="4" style="padding:16px 12px;color:#6b7280;">No line items.</td></tr>`}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3" align="right" style="padding:14px 12px;font-size:14px;color:#111827;font-weight:600;border-top:2px solid #111827;">Total</td>
                <td align="right" style="padding:14px 12px;font-size:16px;color:#111827;font-weight:700;border-top:2px solid #111827;">${formatMoney(order.totalAmount, order.currency)}</td>
              </tr>
            </tfoot>
          </table>

          <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
            Thank you for shopping with ${escapeHtml(appName)}. If anything looks wrong on this invoice,
            reply to this email or contact our support team with your order number.
          </p>
        </td></tr>

        <tr>
          <td style="background:#f9fafb;padding:14px 28px;text-align:center;font-size:12px;color:#9ca3af;">
            ${escapeHtml(appName)} · This is an automated invoice; please retain it for your records.
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

/**
 * Generate an HTML invoice for the given order, upload it to S3 under
 * `invoices/<orderNumber>-<invoiceNumber>.html`, and return both the invoice
 * number and the public URL. Caller is responsible for persisting these onto
 * the Order document.
 *
 * The function never throws to the caller because invoice generation is best-
 * effort during the verify path — on failure it returns { number: "", url: "" }
 * and logs. A subsequent admin action can regenerate.
 */
const generateInvoice = async (order) => {
  if (!order) return { number: "", url: "" };

  try {
    const invoiceNumber = await nextInvoiceNumber();
    const appName = process.env.APP_NAME || "Satya";

    const html = buildInvoiceHtml({
      order,
      invoiceNumber,
      appName,
    });

    const buffer = Buffer.from(html, "utf-8");
    const fakeFile = {
      buffer,
      originalname: `${order.orderNumber}-${invoiceNumber}.html`,
      mimetype: "text/html; charset=utf-8",
    };

    const url = await uploadFile(fakeFile, "invoices");
    return { number: invoiceNumber, url };
  } catch (err) {
    console.error(
      "[invoiceService] generateInvoice failed:",
      err?.message || err
    );
    return { number: "", url: "" };
  }
};

module.exports = {
  generateInvoice,
  nextInvoiceNumber,
  _internal: { buildInvoiceHtml },
};
