const mongoose = require("mongoose");
const HttpError = require("./httpError");

const affectedOrderItemSchema = {
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  title: { type: String, required: true, trim: true },
  imageUrl: { type: String, default: "" },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
  lineTotal: { type: Number, required: true, min: 0 },
};

const normalizeProductId = (value) => {
  if (!value) return "";
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value).trim();
};

const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

/**
 * Resolve user selections against an order's line items.
 * When `rawSelections` is empty, all order lines are returned (backward compatible).
 */
const resolveAffectedItems = (order, rawSelections = []) => {
  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    throw new HttpError("Order has no items to return or replace.", 400);
  }

  const selections = Array.isArray(rawSelections) ? rawSelections : [];
  if (selections.length === 0) {
    return order.items.map((line) => snapshotLine(line, line.quantity));
  }

  const byProduct = new Map();
  for (const line of order.items) {
    const pid = normalizeProductId(line.product);
    if (!pid) continue;
    byProduct.set(pid, line);
  }

  const merged = new Map();
  for (const raw of selections) {
    const productId = normalizeProductId(raw.productId ?? raw.product);
    const qty = Number(raw.quantity);
    if (!productId) {
      throw new HttpError("Each selected item must include productId.", 400);
    }
    if (!Number.isFinite(qty) || qty < 1) {
      throw new HttpError("Each selected item must have quantity of at least 1.", 400);
    }
    const line = byProduct.get(productId);
    if (!line) {
      throw new HttpError("One or more selected items are not on this order.", 400);
    }
    const maxQty = Number(line.quantity) || 1;
    if (qty > maxQty) {
      throw new HttpError(
        `Quantity for "${line.title}" cannot exceed ${maxQty} (ordered quantity).`,
        400
      );
    }
    const prev = merged.get(productId) || 0;
    if (prev + qty > maxQty) {
      throw new HttpError(
        `Total quantity for "${line.title}" cannot exceed ${maxQty}.`,
        400
      );
    }
    merged.set(productId, prev + qty);
  }

  if (merged.size === 0) {
    throw new HttpError("Select at least one item to return or replace.", 400);
  }

  return [...merged.entries()].map(([productId, qty]) => {
    const line = byProduct.get(productId);
    return snapshotLine(line, qty);
  });
};

const snapshotLine = (line, quantity) => {
  const unit = Number(line.price) || 0;
  const qty = Number(quantity) || 1;
  return {
    product: line.product,
    title: String(line.title || "").trim() || "Item",
    imageUrl: String(line.imageUrl || ""),
    quantity: qty,
    price: unit,
    lineTotal: roundMoney(unit * qty),
  };
};

const sumAffectedLineTotals = (items = []) =>
  roundMoney(
    (items || []).reduce((sum, line) => sum + (Number(line.lineTotal) || 0), 0)
  );

const isFullOrderItemSelection = (order, affectedItems = []) => {
  if (!order?.items?.length || !affectedItems?.length) return false;
  if (affectedItems.length !== order.items.length) return false;
  for (const line of order.items) {
    const pid = normalizeProductId(line.product);
    const selected = affectedItems.find(
      (item) => normalizeProductId(item.product) === pid
    );
    if (!selected || Number(selected.quantity) !== Number(line.quantity)) {
      return false;
    }
  }
  return true;
};

/**
 * Refund amount for selected lines. Full-order selection refunds order.totalAmount
 * (includes delivery/tax); partial selection refunds line totals only.
 */
const computeRefundAmount = (order, affectedItems = []) => {
  const lineSum = sumAffectedLineTotals(affectedItems);
  if (isFullOrderItemSelection(order, affectedItems)) {
    return roundMoney(Number(order.totalAmount) || lineSum);
  }
  return lineSum;
};

const parseAffectedItemsInput = (raw, fieldName = "affectedItems") => {
  if (raw === undefined || raw === null || raw === "") return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      throw new HttpError(`${fieldName} must be a JSON array`, 400);
    }
  }
  return [];
};

module.exports = {
  affectedOrderItemSchema,
  resolveAffectedItems,
  sumAffectedLineTotals,
  isFullOrderItemSelection,
  computeRefundAmount,
  parseAffectedItemsInput,
  normalizeProductId,
};
