const User = require("../models/User");
const { sendMail } = require("./emailService");

const appName = () => process.env.APP_NAME || "Satya";

const adminInbox = () =>
  process.env.ORDER_ADMIN_INBOX ||
  process.env.BREVO_SENDER_EMAIL ||
  null;

const escapeHtml = (value) => {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const formatMoney = (amount, currency = "ZAR") =>
  `${escapeHtml(currency)} ${Number(amount || 0).toFixed(2)}`;

const renderItemsTable = (items, currency) => {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p style="margin:0;color:#6b7280;">No items.</p>`;
  }
  const rows = items
    .map(
      (line) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(line.title)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${escapeHtml(line.quantity)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatMoney(line.lineTotal, currency)}</td>
      </tr>`
    )
    .join("");
  return `
    <table width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin-top:8px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th align="left" style="padding:10px 12px;font-size:12px;text-transform:uppercase;color:#374151;letter-spacing:1px;border-bottom:1px solid #e5e7eb;">Item</th>
          <th align="center" style="padding:10px 12px;font-size:12px;text-transform:uppercase;color:#374151;letter-spacing:1px;border-bottom:1px solid #e5e7eb;">Qty</th>
          <th align="right" style="padding:10px 12px;font-size:12px;text-transform:uppercase;color:#374151;letter-spacing:1px;border-bottom:1px solid #e5e7eb;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
};

const renderAddress = (addr) => {
  if (!addr) return "—";
  return [
    addr.fullName,
    addr.phone,
    addr.addressLine1,
    [addr.city, addr.state].filter(Boolean).join(", "),
    addr.postalCode,
    addr.country,
  ]
    .filter((v) => v && String(v).trim().length > 0)
    .map(escapeHtml)
    .join("<br/>");
};

const cardShell = ({ accent = "#4f46e5", banner, title, body }) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f6fa;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:linear-gradient(135deg,${accent},#1f2937);padding:24px 28px;color:#fff;">
            <div style="font-size:13px;letter-spacing:1.5px;opacity:0.85;">${escapeHtml(appName().toUpperCase())}</div>
            <div style="font-size:22px;font-weight:600;margin-top:6px;">${escapeHtml(banner)}</div>
          </td>
        </tr>
        <tr><td style="padding:24px 28px;">${body}</td></tr>
        <tr>
          <td style="background:#f9fafb;padding:14px 28px;text-align:center;font-size:12px;color:#9ca3af;">
            ${escapeHtml(appName())} · automated email
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const loadRecipientEmail = async (userOrId) => {
  if (!userOrId) return null;
  if (typeof userOrId === "object" && userOrId.email) return userOrId;
  try {
    return await User.findById(userOrId).select("email fullName");
  } catch (_) {
    return null;
  }
};

const safeSend = async (params) => {
  try {
    return await sendMail(params);
  } catch (err) {
    console.error(
      `[orderEmailService] sendMail failed to=${params?.to} subject="${params?.subject}":`,
      err?.message || err
    );
    return { delivered: false, error: err?.message || String(err) };
  }
};

const resolveTrackingUrl = (order) => {
  const tracking = order?.tracking || {};
  const explicit = toTrimmedOrNull(tracking.trackingUrl);
  if (explicit) return explicit;

  const waybill =
    toTrimmedOrNull(tracking.trackingNumber) ||
    toTrimmedOrNull(order?.delivery?.waybill);
  if (!waybill) return null;

  const base = (
    process.env.TCG_TRACKING_PUBLIC_BASE_URL ||
    "https://www.thecourierguy.co.za/track"
  ).replace(/\/$/, "");
  return `${base}?waybill=${encodeURIComponent(waybill)}`;
};

const toTrimmedOrNull = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

/**
 * Email to the buyer once their order is paid (BRS: "System sends user email").
 * Best-effort — never throws.
 */
const sendOrderConfirmation = async (order) => {
  if (!order) return { delivered: false, reason: "no-order" };
  const user = await loadRecipientEmail(order.user);
  const to = user?.email;
  if (!to) return { delivered: false, reason: "no-recipient-email" };

  const subject = `Your ${appName()} order ${order.orderNumber} is confirmed`;
  const invoiceCta = order?.invoice?.url
    ? `<p style="margin:18px 0 0;font-size:14px;line-height:1.6;">
         Your invoice is available here:
         <a href="${escapeHtml(order.invoice.url)}" style="color:#4f46e5;">${escapeHtml(order.invoice.number || "View invoice")}</a>
       </p>`
    : "";

  const body = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Hi <strong>${escapeHtml(user.fullName || "there")}</strong>,</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
      We've received your order <strong>${escapeHtml(order.orderNumber)}</strong>.
      Total <strong>${formatMoney(order.totalAmount, order.currency)}</strong>.
    </p>
    ${renderItemsTable(order.items, order.currency)}
    <div style="margin-top:24px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Shipping to</div>
    <div style="margin-top:6px;font-size:14px;line-height:1.5;">${renderAddress(order.shippingAddress)}</div>
    ${invoiceCta}
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
      We'll email you again as soon as your order ships.
    </p>`;

  return safeSend({
    to,
    subject,
    html: cardShell({ accent: "#4f46e5", banner: "Order confirmed", title: subject, body }),
    text: `Thanks ${user.fullName || ""}, your order ${order.orderNumber} (${formatMoney(order.totalAmount, order.currency).replace(/<[^>]+>/g, "")}) is confirmed. ${order?.invoice?.url ? `Invoice: ${order.invoice.url}` : ""}`,
  });
};

/**
 * Email to the admin mailbox once an order is paid (BRS: "delivery location and
 * reference number to admin mailbox").
 */
const sendOrderAdminNotification = async (order) => {
  if (!order) return { delivered: false, reason: "no-order" };
  const to = adminInbox();
  if (!to) return { delivered: false, reason: "no-admin-inbox" };

  const buyer = await loadRecipientEmail(order.user);
  const subject = `[${appName()}] New paid order ${order.orderNumber}`;
  const body = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
      A new paid order has come in.
    </p>
    <table width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:6px 0;color:#6b7280;width:140px;">Order number</td><td><strong>${escapeHtml(order.orderNumber)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Reference</td><td>${escapeHtml(order.paystackReference || "—")}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Total</td><td><strong>${formatMoney(order.totalAmount, order.currency)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Buyer</td><td>${escapeHtml(buyer?.fullName || "—")} ${buyer?.email ? `&lt;${escapeHtml(buyer.email)}&gt;` : ""}</td></tr>
    </table>
    ${renderItemsTable(order.items, order.currency)}
    <div style="margin-top:24px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Deliver to</div>
    <div style="margin-top:6px;font-size:14px;line-height:1.5;">${renderAddress(order.shippingAddress)}</div>`;

  return safeSend({
    to,
    subject,
    html: cardShell({ accent: "#0f766e", banner: "New paid order", title: subject, body }),
    text: `Paid order ${order.orderNumber} — total ${order.totalAmount} ${order.currency}. Buyer: ${buyer?.email || "?"}.`,
  });
};

/**
 * Email to the buyer when admin records tracking + ships
 * (BRS: "Admin shares tracking details").
 */
const sendTrackingShared = async (order) => {
  if (!order) return { delivered: false, reason: "no-order" };
  const user = await loadRecipientEmail(order.user);
  const to = user?.email;
  if (!to) return { delivered: false, reason: "no-recipient-email" };

  const tracking = order.tracking || {};
  const trackingUrl = resolveTrackingUrl(order);
  const subject = `Your ${appName()} order ${order.orderNumber} is on its way`;
  const trackingNumberLine = escapeHtml(tracking.trackingNumber || "—");
  const trackingUrlLine = trackingUrl
    ? `<a href="${escapeHtml(trackingUrl)}" style="color:#4f46e5;word-break:break-all;">${escapeHtml(trackingUrl)}</a>`
    : "—";

  const body = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Hi <strong>${escapeHtml(user.fullName || "there")}</strong>,</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
      Good news — your order <strong>${escapeHtml(order.orderNumber)}</strong> has been dispatched.
    </p>
    <table width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:6px 0;color:#6b7280;width:140px;">Courier</td><td><strong>${escapeHtml(tracking.courier || "—")}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Tracking number</td><td>${trackingNumberLine}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Tracking URL</td><td>${trackingUrlLine}</td></tr>
    </table>
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
      You'll receive another email once it's delivered so you can confirm receipt.
    </p>`;

  return safeSend({
    to,
    subject,
    html: cardShell({ accent: "#2563eb", banner: "Your order is on its way", title: subject, body }),
    text:
      `Your order ${order.orderNumber} shipped via ${tracking.courier || "courier"}. ` +
      `Tracking number: ${tracking.trackingNumber || "—"}.` +
      (trackingUrl ? ` Track here: ${trackingUrl}` : ""),
  });
};

/**
 * Email to the buyer once the order is marked DELIVERED — asks them to confirm
 * receipt or open a refund / replacement request (BRS: "Customer Satisfied?").
 */
const sendDeliveryConfirmationPrompt = async (order) => {
  if (!order) return { delivered: false, reason: "no-order" };
  const user = await loadRecipientEmail(order.user);
  const to = user?.email;
  if (!to) return { delivered: false, reason: "no-recipient-email" };

  const subject = `Did you receive your ${appName()} order ${order.orderNumber}?`;
  const body = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Hi <strong>${escapeHtml(user.fullName || "there")}</strong>,</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
      Our records show your order <strong>${escapeHtml(order.orderNumber)}</strong> has been delivered.
      Could you take a moment to let us know if everything arrived as expected?
    </p>
    <p style="margin:18px 0 0;font-size:14px;line-height:1.6;">
      If everything is good, you can confirm receipt from the <em>${escapeHtml(appName())}</em> app
      under <strong>My Orders</strong>.
    </p>
    <p style="margin:18px 0 0;font-size:14px;line-height:1.6;">
      If anything is missing, damaged, or wrong, please open a
      <strong>Refund</strong> or <strong>Replacement</strong> request from the same screen and
      we'll take it from there.
    </p>`;

  return safeSend({
    to,
    subject,
    html: cardShell({ accent: "#059669", banner: "Did your order arrive okay?", title: subject, body }),
    text: `Your order ${order.orderNumber} is marked delivered. Confirm receipt or raise a refund / replacement request in the app.`,
  });
};

/**
 * Email when a pickup order is ready for customer collection.
 */
const sendReadyForPickup = async (order) => {
  if (!order) return { delivered: false, reason: "no-order" };
  const user = await loadRecipientEmail(order.user);
  const to = user?.email;
  if (!to) return { delivered: false, reason: "no-recipient-email" };

  const loc = order.pickupLocation || {};
  const addressLine = [
    loc.company,
    loc.streetAddress || loc.enteredAddress,
    loc.localArea,
    loc.city,
    loc.postalCode,
  ]
    .filter(Boolean)
    .join(", ");

  const subject = `Your ${appName()} order ${order.orderNumber} is ready for pickup`;
  const body = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Hi <strong>${escapeHtml(user.fullName || "there")}</strong>,</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
      Your order <strong>${escapeHtml(order.orderNumber)}</strong> is ready for collection.
    </p>
    <div style="margin-top:18px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Pickup location</div>
    <div style="margin-top:6px;font-size:14px;line-height:1.5;">${escapeHtml(addressLine || "See the app for details")}</div>
    ${loc.hours ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.5;"><strong>Hours:</strong> ${escapeHtml(loc.hours)}</p>` : ""}
    ${loc.instructions ? `<p style="margin:8px 0 0;font-size:14px;line-height:1.5;">${escapeHtml(loc.instructions)}</p>` : ""}
    <p style="margin:18px 0 0;font-size:14px;line-height:1.6;">
      Please bring your order number and a valid ID. Confirm collection in the app once you have picked it up.
    </p>`;

  return safeSend({
    to,
    subject,
    html: cardShell({
      accent: "#d97706",
      banner: "Ready for pickup",
      title: subject,
      body,
    }),
    text:
      `Your order ${order.orderNumber} is ready for pickup` +
      (addressLine ? ` at ${addressLine}.` : ".") +
      (loc.hours ? ` Hours: ${loc.hours}.` : ""),
  });
};

/**
 * Email to the buyer whenever their CANCELLATION / REFUND / REPLACEMENT request
 * transitions (APPROVED / REJECTED / COMPLETED).
 */
const sendRequestStatusUpdate = async (orderRequest, { order, replacementOrder } = {}) => {
  if (!orderRequest) return { delivered: false, reason: "no-request" };
  const user = await loadRecipientEmail(orderRequest.user);
  const to = user?.email;
  if (!to) return { delivered: false, reason: "no-recipient-email" };

  const typeLabel = (orderRequest.type || "").toLowerCase();
  const statusLabel = (orderRequest.status || "").toLowerCase();
  const subject = `Your ${typeLabel} request ${orderRequest.requestNumber || ""} is ${statusLabel}`;

  const replacementLine =
    orderRequest.type === "REPLACEMENT" && replacementOrder?.orderNumber
      ? `<p style="margin:18px 0 0;font-size:14px;line-height:1.6;">
           A new replacement order has been created: <strong>${escapeHtml(replacementOrder.orderNumber)}</strong>.
           You'll get a separate dispatch email when it ships.
         </p>`
      : "";

  const body = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Hi <strong>${escapeHtml(user.fullName || "there")}</strong>,</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
      Your <strong>${escapeHtml(orderRequest.type)}</strong> request
      <strong>${escapeHtml(orderRequest.requestNumber || "")}</strong>
      for order <strong>${escapeHtml(order?.orderNumber || "")}</strong>
      is now <strong>${escapeHtml(orderRequest.status)}</strong>.
    </p>
    ${orderRequest.adminNote ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#374151;background:#f3f4f6;padding:12px 14px;border-radius:8px;">${escapeHtml(orderRequest.adminNote)}</p>` : ""}
    ${replacementLine}
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
      You can review the full history of this request in the ${escapeHtml(appName())} app.
    </p>`;

  const accent =
    orderRequest.status === "APPROVED" || orderRequest.status === "COMPLETED"
      ? "#059669"
      : orderRequest.status === "REJECTED"
        ? "#dc2626"
        : "#4f46e5";

  return safeSend({
    to,
    subject,
    html: cardShell({ accent, banner: `Request ${orderRequest.status}`, title: subject, body }),
    text: `Your ${orderRequest.type} request ${orderRequest.requestNumber || ""} for order ${order?.orderNumber || ""} is now ${orderRequest.status}.`,
  });
};

/**
 * Email to the buyer when an admin cancels the order (BRS: "Cancellation
 * Process" — admin-mediated). `refunded` is true when the cancellation
 * automatically flipped `paymentStatus` to `REFUNDED` (immediate Paystack success).
 */
const sendOrderCancelledByAdmin = async (
  order,
  {
    reason = "",
    refunded = false,
    refundPending = false,
    refundFailed = false,
    refundError = "",
    byUser = false,
  } = {}
) => {
  if (!order) return { delivered: false, reason: "no-order" };
  const user = await loadRecipientEmail(order.user);
  const to = user?.email;
  if (!to) return { delivered: false, reason: "no-recipient-email" };

  const subject = `Your ${appName()} order ${order.orderNumber} has been cancelled`;
  const reasonBlock = reason
    ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#374151;background:#f3f4f6;padding:12px 14px;border-radius:8px;">
         <strong>${byUser ? "Your note:" : "Reason from admin:"}</strong> ${escapeHtml(reason)}
       </p>`
    : "";

  let refundBlock;
  if (refunded) {
    refundBlock = `<p style="margin:18px 0 0;font-size:14px;line-height:1.6;">
         Your payment has been <strong>refunded</strong> via Paystack. It will
         appear back on your original payment method within a few business days.
       </p>`;
  } else if (refundPending) {
    refundBlock = `<p style="margin:18px 0 0;font-size:14px;line-height:1.6;">
         A <strong>refund has been initiated</strong> via Paystack and is currently
         being processed. It will appear back on your original payment method
         within a few business days. You'll receive a final confirmation once
         settlement completes.
       </p>`;
  } else if (refundFailed) {
    refundBlock = `<p style="margin:18px 0 0;font-size:14px;line-height:1.6;">
         We're processing your refund manually with our payments team. You will
         receive a separate confirmation as soon as it is on its way back to
         your original payment method. If you don't hear from us within a few
         business days, please reply to this email.
       </p>`;
  } else {
    refundBlock = `<p style="margin:18px 0 0;font-size:14px;line-height:1.6;">
         No payment was captured for this order, so no refund is needed.
       </p>`;
  }

  const body = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Hi <strong>${escapeHtml(user.fullName || "there")}</strong>,</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
      We're writing to let you know that your order
      <strong>${escapeHtml(order.orderNumber)}</strong>
      has been <strong>cancelled</strong>${byUser ? " as you requested" : " by our team"}.
    </p>
    ${reasonBlock}
    ${renderItemsTable(order.items, order.currency)}
    ${refundBlock}
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
      If this wasn't expected, please reply to this email or contact our
      support team with your order number.
    </p>`;

  return safeSend({
    to,
    subject,
    html: cardShell({
      accent: "#dc2626",
      banner: "Your order has been cancelled",
      title: subject,
      body,
    }),
    text:
      `Your ${appName()} order ${order.orderNumber} has been cancelled${byUser ? "" : " by admin"}.` +
      (reason ? ` Reason: ${reason}.` : "") +
      (refunded
        ? " Your payment has been refunded via Paystack."
        : refundPending
          ? " A refund has been initiated and is being processed by Paystack."
          : refundFailed
            ? " Your refund is being processed manually by our payments team."
            : " No payment was captured, so no refund is needed."),
  });
};

/**
 * Email to the buyer once Paystack confirms a refund has settled
 * (`refund.processed` webhook → `order.refund.status === "PROCESSED"`).
 * Best-effort — never throws.
 */
const sendRefundProcessed = async (order) => {
  if (!order) return { delivered: false, reason: "no-order" };
  const user = await loadRecipientEmail(order.user);
  const to = user?.email;
  if (!to) return { delivered: false, reason: "no-recipient-email" };

  const refundAmount =
    order?.refund?.amount && Number(order.refund.amount) > 0
      ? Number(order.refund.amount)
      : order.totalAmount;
  const refundCurrency = order?.refund?.currency || order.currency;
  const refundRef = order?.refund?.paystackRefundId || "";

  const subject = `Refund processed for order ${order.orderNumber}`;
  const body = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Hi <strong>${escapeHtml(user.fullName || "there")}</strong>,</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
      Good news — your refund of
      <strong>${formatMoney(refundAmount, refundCurrency)}</strong>
      for order <strong>${escapeHtml(order.orderNumber)}</strong>
      has been <strong>processed by Paystack</strong>.
    </p>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;">
      It should reflect on your original payment method within a few business
      days, depending on your bank.
    </p>
    ${
      refundRef
        ? `<table width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;font-size:13px;margin-top:6px;">
             <tr><td style="padding:4px 0;color:#6b7280;width:140px;">Paystack refund id</td><td><strong>${escapeHtml(refundRef)}</strong></td></tr>
             <tr><td style="padding:4px 0;color:#6b7280;">Order reference</td><td>${escapeHtml(order.paystackReference || "—")}</td></tr>
           </table>`
        : ""
    }
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
      If the refund hasn't appeared after 5–7 business days, reply to this
      email with your order number and we'll chase it up with the bank.
    </p>`;

  return safeSend({
    to,
    subject,
    html: cardShell({
      accent: "#059669",
      banner: "Your refund has been processed",
      title: subject,
      body,
    }),
    text:
      `Your refund of ${refundAmount} ${refundCurrency} for order ${order.orderNumber} has been processed by Paystack. ` +
      `It should appear on your original payment method within a few business days.` +
      (refundRef ? ` Paystack refund id: ${refundRef}.` : ""),
  });
};

const sendReplacementRequestSubmitted = async (request) => {
  if (!request) return { delivered: false, reason: "no-request" };
  const user = await loadRecipientEmail(request.user);
  const to = user?.email;
  if (!to) return { delivered: false, reason: "no-recipient-email" };
  const orderNo = request.order?.orderNumber || "";
  const subject = `Replacement request ${request.requestNumber} received`;
  const body = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Hi <strong>${escapeHtml(user.fullName || "there")}</strong>,</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
      We received your replacement request <strong>${escapeHtml(request.requestNumber)}</strong>
      for order <strong>${escapeHtml(orderNo)}</strong>. Our team will review it shortly.
    </p>`;
  return safeSend({
    to,
    subject,
    html: cardShell({ accent: "#4f46e5", banner: "Replacement request", title: subject, body }),
    text: `We received your replacement request ${request.requestNumber} for order ${orderNo}.`,
  });
};

const sendReplacementNewRequestAdminAlert = async (request) => {
  const inbox = adminInbox();
  if (!inbox) return { delivered: false, reason: "no-admin-inbox" };
  const orderNo = request.order?.orderNumber || "";
  const subject = `[${appName()}] New replacement request ${request.requestNumber}`;
  const body = `
    <p><strong>Request:</strong> ${escapeHtml(request.requestNumber)}</p>
    <p><strong>Order:</strong> ${escapeHtml(orderNo)}</p>
    <p><strong>Reason:</strong></p>
    <p style="background:#f3f4f6;padding:12px;border-radius:8px;">${escapeHtml(request.reason || "")}</p>
    <p>Review in admin: <code>/admin/replacements</code></p>`;
  return safeSend({
    to: inbox,
    subject,
    html: cardShell({ accent: "#b45309", banner: "New replacement request", title: subject, body }),
    text: `New replacement ${request.requestNumber} for order ${orderNo}.`,
  });
};

const sendReplacementApproved = async (request) => {
  if (!request) return { delivered: false, reason: "no-request" };
  const user = await loadRecipientEmail(request.user);
  const to = user?.email;
  if (!to) return { delivered: false, reason: "no-recipient-email" };
  const repNo = request.replacementOrder?.orderNumber || "";
  const subject = repNo
    ? `Your replacement was approved — ${repNo}`
    : "Your replacement was approved";
  const body = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Hi <strong>${escapeHtml(user.fullName || "there")}</strong>,</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
      Your replacement request <strong>${escapeHtml(request.requestNumber)}</strong> was approved.
      A new order <strong>${escapeHtml(repNo)}</strong> has been created — no additional charge.
      You will receive shipping updates like a normal order.
    </p>`;
  return safeSend({
    to,
    subject,
    html: cardShell({ accent: "#059669", banner: "Replacement approved", title: subject, body }),
    text: `Your replacement was approved. New order ${repNo}. No additional charge.`,
  });
};

const sendReplacementRejected = async (request) => {
  if (!request) return { delivered: false, reason: "no-request" };
  const user = await loadRecipientEmail(request.user);
  const to = user?.email;
  if (!to) return { delivered: false, reason: "no-recipient-email" };
  const orderNo = request.order?.orderNumber || "";
  const subject = `Replacement request ${request.requestNumber} was not approved`;
  const remarks = request.adminRemarks
    ? `<p style="margin:14px 0;font-size:14px;background:#fef2f2;padding:12px;border-radius:8px;">${escapeHtml(request.adminRemarks)}</p>`
    : "";
  const body = `
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Hi <strong>${escapeHtml(user.fullName || "there")}</strong>,</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
      Your replacement request <strong>${escapeHtml(request.requestNumber)}</strong>
      for order <strong>${escapeHtml(orderNo)}</strong> was not approved.
    </p>
    ${remarks}`;
  return safeSend({
    to,
    subject,
    html: cardShell({ accent: "#dc2626", banner: "Replacement request", title: subject, body }),
    text: `Your replacement request ${request.requestNumber} for order ${orderNo} was not approved.`,
  });
};

module.exports = {
  sendOrderConfirmation,
  sendOrderAdminNotification,
  sendTrackingShared,
  sendDeliveryConfirmationPrompt,
  sendReadyForPickup,
  sendRequestStatusUpdate,
  sendOrderCancelledByAdmin,
  sendRefundProcessed,
  sendReplacementRequestSubmitted,
  sendReplacementNewRequestAdminAlert,
  sendReplacementApproved,
  sendReplacementRejected,
};
