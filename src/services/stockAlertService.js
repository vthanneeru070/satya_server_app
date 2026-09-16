const User = require("../models/User");
const InventoryItem = require("../models/InventoryItem");
const Product = require("../models/Product");
const { sendMail } = require("./emailService");
const adminNotificationService = require("./adminNotificationService");
const { ADMIN_NOTIFICATION_TYPES } = require("../constants/adminNotificationTypes");
const {
  computeAvailableKits,
  resolveInventoryItemId,
  parseKitLineQuantity,
  loadInventoryMap,
} = require("./inventoryService");
const { usesProductQuantity } = require("../validations/productValidation");

const ADMIN_ROLES = ["admin", "superadmin"];
const STOCK_OK = "OK";
const STOCK_LOW = "LOW_STOCK";
const STOCK_OUT = "OUT_OF_STOCK";

const notDeleted = { isDeleted: { $ne: true } };

const appName = () => process.env.APP_NAME || "Satya";

const productLowStockThreshold = () => {
  const n = Number(process.env.PRODUCT_LOW_STOCK_THRESHOLD);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 10;
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

const stockLevel = (qty, threshold) => {
  const q = Math.max(0, Number(qty) || 0);
  const t = Math.max(0, Number(threshold) || 0);
  if (q <= 0) return STOCK_OUT;
  if (q <= t) return STOCK_LOW;
  return STOCK_OK;
};

/** Alert when entering LOW from OK, or entering OUT from anything else. */
const shouldAlert = (previousLevel, nextLevel) => {
  if (nextLevel === STOCK_OK) return false;
  if (nextLevel === STOCK_OUT && previousLevel !== STOCK_OUT) return true;
  if (nextLevel === STOCK_LOW && previousLevel === STOCK_OK) return true;
  return false;
};

const collectAdminEmails = async () => {
  const admins = await User.find({
    role: { $in: ADMIN_ROLES },
    isDeleted: { $ne: true },
    email: { $exists: true, $nin: [null, ""] },
  })
    .select("email fullName")
    .lean();

  const seen = new Set();
  const recipients = [];
  for (const admin of admins) {
    const email = String(admin.email || "")
      .trim()
      .toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    recipients.push({
      email: admin.email.trim(),
      name: admin.fullName || "",
    });
  }
  return recipients;
};

const levelLabel = (level) => {
  if (level === STOCK_OUT) return "Out of stock";
  if (level === STOCK_LOW) return "Low stock";
  return "In stock";
};

const buildEmail = ({
  kind,
  name,
  level,
  quantity,
  threshold,
  unitLabel,
}) => {
  const isOut = level === STOCK_OUT;
  const accent = isOut ? "#b91c1c" : "#c2410c";
  const banner = isOut ? "Out of stock alert" : "Low stock alert";
  const subject = `${appName()}: ${levelLabel(level)} — ${name}`;
  const kindLabel = kind === "inventory" ? "Inventory item" : "Product";
  const qtyLine = unitLabel
    ? `${quantity} ${unitLabel}`
    : String(quantity);

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
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
        <tr><td style="padding:24px 28px;">
          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
            The following ${escapeHtml(kindLabel.toLowerCase())} needs attention:
          </p>
          <table width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin:8px 0 16px;">
            <tr>
              <td style="padding:10px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;width:140px;color:#6b7280;font-size:13px;">${escapeHtml(kindLabel)}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;">${escapeHtml(name)}</td>
            </tr>
            <tr>
              <td style="padding:10px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Status</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;color:${accent};">${escapeHtml(levelLabel(level))}</td>
            </tr>
            <tr>
              <td style="padding:10px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Current stock</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(qtyLine)}</td>
            </tr>
            <tr>
              <td style="padding:10px 12px;background:#f9fafb;color:#6b7280;font-size:13px;">Low-stock threshold</td>
              <td style="padding:10px 12px;">${escapeHtml(String(threshold))}</td>
            </tr>
          </table>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">
            Please restock this ${escapeHtml(kindLabel.toLowerCase())} in the admin panel when you can.
          </p>
        </td></tr>
        <tr>
          <td style="background:#f9fafb;padding:14px 28px;text-align:center;font-size:12px;color:#9ca3af;">
            ${escapeHtml(appName())} · automated stock alert
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `${banner}`,
    `${kindLabel}: ${name}`,
    `Status: ${levelLabel(level)}`,
    `Current stock: ${qtyLine}`,
    `Low-stock threshold: ${threshold}`,
  ].join("\n");

  return { subject, html, text };
};

const sendToAllAdmins = async (emailPayload) => {
  const recipients = await collectAdminEmails();
  if (!recipients.length) {
    console.warn("[stockAlertService] no admin/superadmin emails found");
    return { sent: 0, failed: 0, recipients: 0 };
  }

  let sent = 0;
  let failed = 0;
  await Promise.all(
    recipients.map(async (r) => {
      try {
        const result = await sendMail({
          to: r.name ? `"${r.name}" <${r.email}>` : r.email,
          subject: emailPayload.subject,
          html: emailPayload.html,
          text: emailPayload.text,
        });
        if (result?.delivered || result?.dryRun) sent += 1;
        else failed += 1;
      } catch (err) {
        failed += 1;
        console.error(
          `[stockAlertService] email failed to=${r.email}:`,
          err?.message || err
        );
      }
    })
  );
  return { sent, failed, recipients: recipients.length };
};

/**
 * Email (+ optional in-app notification) when stock crosses into low / out.
 * Best-effort — never throws.
 */
const alertStockChange = async ({
  kind,
  id,
  name,
  previousQty,
  nextQty,
  threshold,
  previousThreshold,
  unitLabel = "",
  category = "",
}) => {
  try {
    const t = Math.max(0, Number(threshold) || 0);
    const prevT =
      previousThreshold === null || previousThreshold === undefined
        ? t
        : Math.max(0, Number(previousThreshold) || 0);
    const prevLevel =
      previousQty === null || previousQty === undefined
        ? STOCK_OK
        : stockLevel(previousQty, prevT);
    const nextLevel = stockLevel(nextQty, t);
    if (!shouldAlert(prevLevel, nextLevel)) return null;

    const emailPayload = buildEmail({
      kind,
      name: name || "Unknown",
      level: nextLevel,
      quantity: Math.max(0, Number(nextQty) || 0),
      threshold: t,
      unitLabel,
    });

    const mail = await sendToAllAdmins(emailPayload);

    const notifType =
      nextLevel === STOCK_OUT
        ? ADMIN_NOTIFICATION_TYPES.OUT_OF_STOCK
        : ADMIN_NOTIFICATION_TYPES.LOW_STOCK;

    await adminNotificationService
      .recordAndNotify({
        type: notifType,
        sourceKey: `${kind}:${id}:${notifType}:${Date.now()}`,
        title: levelLabel(nextLevel),
        body: `${name || "Item"} — stock ${Math.max(0, Number(nextQty) || 0)}${
          unitLabel ? ` ${unitLabel}` : ""
        }`,
        data: {
          type: notifType,
          kind,
          itemId: String(id || ""),
          name: String(name || ""),
          quantity: String(Math.max(0, Number(nextQty) || 0)),
          threshold: String(t),
          category: String(category || ""),
        },
        logTag: "stockAlert",
      })
      .catch((err) =>
        console.warn("[stockAlertService] admin notify:", err?.message || err)
      );

    return { level: nextLevel, mail };
  } catch (err) {
    console.warn("[stockAlertService] alertStockChange:", err?.message || err);
    return null;
  }
};

const notifyInventoryItem = async (
  item,
  { previousQty, previousThreshold } = {}
) => {
  if (!item?._id) return null;
  return alertStockChange({
    kind: "inventory",
    id: item._id,
    name: item.name,
    previousQty,
    nextQty: item.stockQuantity,
    threshold: item.lowStockThreshold ?? 10,
    previousThreshold,
    unitLabel: item.unit || "units",
    category: item.category || "",
  });
};

const notifyQuantityProduct = async (product, { previousQty } = {}) => {
  if (!product?._id || !usesProductQuantity(product.category)) return null;
  return alertStockChange({
    kind: "product",
    id: product._id,
    name: product.title,
    previousQty,
    nextQty: product.quantity,
    threshold: productLowStockThreshold(),
    unitLabel: "units",
    category: product.category || "",
  });
};

const notifyKitProduct = async (product, inventoryById, { previousInvById } = {}) => {
  if (!product?._id || usesProductQuantity(product.category)) return null;
  if (!product.items?.length) return null;

  const nextQty = computeAvailableKits(product.items || [], inventoryById);
  let previousQty = null;
  if (previousInvById) {
    previousQty = computeAvailableKits(product.items || [], previousInvById);
  }

  return alertStockChange({
    kind: "product",
    id: product._id,
    name: product.title,
    previousQty,
    nextQty,
    threshold: productLowStockThreshold(),
    unitLabel: "kits",
    category: product.category || "pujakit",
  });
};

/**
 * After an order deduction commits, evaluate inventory + product stock alerts.
 * Safe to call fire-and-forget after the Mongo transaction ends.
 */
const evaluateAfterOrderDeduction = async (order, productMapInput) => {
  try {
    if (!order?.items?.length) return;

    let productMap = productMapInput;
    if (!productMap || typeof productMap.get !== "function") {
      const ids = order.items.map((l) => l.product);
      const products = await Product.find({ _id: { $in: ids }, ...notDeleted });
      productMap = new Map(products.map((p) => [String(p._id), p]));
    }

    const decrementByInv = new Map();
    for (const line of order.items) {
      const product = productMap.get(String(line.product));
      if (!product?.items?.length) continue;
      for (const kitLine of product.items) {
        const invId = resolveInventoryItemId(kitLine.inventoryItem);
        const perKit = parseKitLineQuantity(kitLine.quantity);
        if (!invId || !perKit) continue;
        const total = Number(line.quantity) * perKit;
        decrementByInv.set(invId, (decrementByInv.get(invId) || 0) + total);
      }
    }

    const invIds = [...decrementByInv.keys()];
    const inventoryById = await loadInventoryMap(invIds);

    const previousInvById = new Map();
    for (const [id, inv] of inventoryById.entries()) {
      const dec = decrementByInv.get(id) || 0;
      previousInvById.set(id, {
        ...inv,
        stockQuantity: (Number(inv.stockQuantity) || 0) + dec,
      });
    }

    for (const [id, inv] of inventoryById.entries()) {
      const dec = decrementByInv.get(id) || 0;
      const nextQty = Number(inv.stockQuantity) || 0;
      await alertStockChange({
        kind: "inventory",
        id,
        name: inv.name,
        previousQty: nextQty + dec,
        nextQty,
        threshold: inv.lowStockThreshold ?? 10,
        unitLabel: inv.unit || "units",
        category: inv.category || "",
      });
    }

    const qtyProductDec = new Map();
    const kitProducts = new Map();
    for (const line of order.items) {
      const product = productMap.get(String(line.product));
      if (!product) continue;
      if (usesProductQuantity(product.category)) {
        const id = String(product._id);
        qtyProductDec.set(
          id,
          (qtyProductDec.get(id) || 0) + Number(line.quantity)
        );
      } else {
        kitProducts.set(String(product._id), product);
      }
    }

    for (const [id, dec] of qtyProductDec.entries()) {
      const fresh = await Product.findById(id)
        .select("title quantity category")
        .lean();
      if (!fresh) continue;
      const current = Number(fresh.quantity) || 0;
      await alertStockChange({
        kind: "product",
        id: fresh._id,
        name: fresh.title,
        previousQty: current + dec,
        nextQty: current,
        threshold: productLowStockThreshold(),
        unitLabel: "units",
        category: fresh.category || "",
      });
    }

    for (const product of kitProducts.values()) {
      await notifyKitProduct(product, inventoryById, { previousInvById });
    }
  } catch (err) {
    console.warn(
      "[stockAlertService] evaluateAfterOrderDeduction:",
      err?.message || err
    );
  }
};

/** Fire-and-forget wrapper so callers never block on email. */
const scheduleAfterOrderDeduction = (order, productMap) => {
  setImmediate(() => {
    evaluateAfterOrderDeduction(order, productMap).catch((err) =>
      console.warn("[stockAlertService] schedule:", err?.message || err)
    );
  });
};

module.exports = {
  STOCK_OK,
  STOCK_LOW,
  STOCK_OUT,
  stockLevel,
  shouldAlert,
  collectAdminEmails,
  alertStockChange,
  notifyInventoryItem,
  notifyQuantityProduct,
  notifyKitProduct,
  evaluateAfterOrderDeduction,
  scheduleAfterOrderDeduction,
  productLowStockThreshold,
};
