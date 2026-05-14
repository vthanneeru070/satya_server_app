const mongoose = require("mongoose");
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Counter = require("../models/Counter");
const ReplacementRequest = require("../models/ReplacementRequest");
const HttpError = require("../utils/httpError");
const orderEmailService = require("./orderEmailService");
const { notifyOrderStatusChanged } = require("./fcmOrderNotifyService");
const paystackService = require("./paystackService");

const ORDER_STATUS_TRANSITIONS = {
  PLACED: new Set(["PROCESSING", "CANCELLED"]),
  PROCESSING: new Set(["SHIPPED", "CANCELLED"]),
  SHIPPED: new Set(["DELIVERED"]),
  // DELIVERED → FULFILLED is driven by user `confirmDelivery({ satisfied: true })`.
  DELIVERED: new Set(["FULFILLED"]),
  FULFILLED: new Set(),
  CANCELLED: new Set(),
};

const TERMINAL_ORDER_STATUSES = new Set(["FULFILLED", "CANCELLED"]);

const effectivePriceOf = (product) =>
  product.salePrice && product.salePrice > 0 ? product.salePrice : product.price;

const normalizeShippingAddress = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  return {
    fullName: raw.fullName,
    phone: raw.phone,
    addressLine1: raw.addressLine1 || raw.line1,
    city: raw.city,
    state: raw.state,
    country: raw.country || "South Africa",
    postalCode: raw.postalCode || raw.pincode,
  };
};

const assertShippingComplete = (addr) => {
  const required = ["fullName", "phone", "addressLine1", "city", "state", "postalCode"];
  const missing = required.filter((k) => !addr[k] || String(addr[k]).trim() === "");
  if (missing.length) {
    throw new HttpError(`shippingAddress missing: ${missing.join(", ")}`, 400);
  }
};

const nextOrderNumber = async (session) => {
  // Pipeline update + upsert: starts at 10001 on first call, increments thereafter.
  // Mongoose 9+ requires `updatePipeline: true` to accept an aggregation pipeline.
  const doc = await Counter.findOneAndUpdate(
    { _id: "orderSequence" },
    [{ $set: { seq: { $add: [{ $ifNull: ["$seq", 10000] }, 1] } } }],
    { returnDocument: "after", upsert: true, session, updatePipeline: true }
  );
  return `SATYA-${doc.seq}`;
};

const assertProductBuyable = (product, requestedQty) => {
  if (!product || product.isDeleted) {
    throw new HttpError("Product not found", 404);
  }
  if (product.status !== "APPROVED" || product.productStatus !== "ACTIVE") {
    throw new HttpError("This product is not available right now", 400);
  }
  if (product.stockQuantity <= 0) {
    throw new HttpError("This product is out of stock", 400);
  }
  if (requestedQty > product.stockQuantity) {
    throw new HttpError(
      `Only ${product.stockQuantity} unit(s) of "${product.title}" are in stock`,
      400
    );
  }
};

const buildSnapshotLine = (product, quantity) => {
  const unit = effectivePriceOf(product);
  return {
    product: product._id,
    title: product.title,
    imageUrl: product.imageUrl || "",
    quantity,
    price: unit,
    lineTotal: unit * quantity,
  };
};

const resolveRequestedLines = async (userId, { items, useCart = true } = {}) => {
  if (Array.isArray(items) && items.length > 0) {
    return items.map((it) => ({
      productId: String(it.productId || it.product),
      quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
    }));
  }
  if (!useCart) return [];

  const cart = await Cart.findOne({ user: userId, isDeleted: { $ne: true } });
  if (!cart || !cart.items.length) {
    throw new HttpError("Cart is empty", 400);
  }
  return cart.items.map((it) => ({
    productId: String(it.product),
    quantity: it.quantity,
  }));
};

/**
 * Validates stock and returns snapshot lines + totals (never trusts client prices).
 */
const buildOrderPayload = async (userId, { items, useCart }) => {
  const requested = await resolveRequestedLines(userId, { items, useCart });
  if (!requested.length) throw new HttpError("No items to order", 400);

  const productIds = requested.map((r) => r.productId);
  const products = await Product.find({ _id: { $in: productIds }, isDeleted: { $ne: true } });
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const snapshots = [];
  let totalAmount = 0;
  let currency = "ZAR";

  for (const r of requested) {
    const product = productMap.get(r.productId);
    assertProductBuyable(product, r.quantity);
    if (product.currency && currency && product.currency !== currency) {
      throw new HttpError("All items in an order must use the same currency", 400);
    }
    currency = product.currency || currency || "ZAR";
    const line = buildSnapshotLine(product, r.quantity);
    snapshots.push(line);
    totalAmount += line.lineTotal;
  }

  return { snapshots, totalAmount, currency };
};

const applyStockDeductionForOrder = async (order, session) => {
  const ops = order.items.map((line) => ({
    updateOne: {
      filter: {
        _id: line.product,
        stockQuantity: { $gte: line.quantity },
        isDeleted: { $ne: true },
      },
      update: {
        $inc: { stockQuantity: -line.quantity, purchaseCount: line.quantity },
      },
    },
  }));
  const result = await Product.bulkWrite(ops, { session });
  if (result.modifiedCount !== ops.length) {
    throw new HttpError(
      "One or more items went out of stock during checkout. Please review your cart.",
      409
    );
  }
};

const persistOrder = async (
  userId,
  { shippingAddress, snapshots, totalAmount, currency, paymentMethod, session }
) => {
  const orderNumber = await nextOrderNumber(session);
  const [order] = await Order.create(
    [
      {
        orderNumber,
        user: userId,
        items: snapshots,
        totalAmount,
        currency,
        paymentStatus: "PENDING",
        orderStatus: "PLACED",
        paymentMethod: paymentMethod || "PAYSTACK",
        orderType: "NORMAL",
        shippingAddress,
        inventoryReserved: false,
        orderStatusHistory: [{ status: "PLACED", at: new Date(), note: "Order created" }],
      },
    ],
    { session }
  );
  return order;
};

/**
 * Checkout from cart only (canonical flow). Does not modify inventory or clear cart.
 */
const checkoutFromCart = async (userId, { shippingAddress } = {}) => {
  const addr = normalizeShippingAddress(shippingAddress);
  assertShippingComplete(addr);

  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      const { snapshots, totalAmount, currency } = await buildOrderPayload(userId, {
        useCart: true,
      });
      order = await persistOrder(userId, {
        shippingAddress: addr,
        snapshots,
        totalAmount,
        currency,
        paymentMethod: "PAYSTACK",
        session,
      });
    });
  } finally {
    await session.endSession();
  }
  return order;
};

/**
 * Place order from explicit items or cart. Paystack orders do not deduct stock until payment succeeds; COD deducts stock at order creation.
 */
const createOrder = async (
  userId,
  {
    items,
    shippingAddress,
    paymentMethod = "PAYSTACK",
    useCart = true,
  } = {}
) => {
  const addr = normalizeShippingAddress(shippingAddress);
  assertShippingComplete(addr);

  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      const { snapshots, totalAmount, currency } = await buildOrderPayload(userId, {
        items,
        useCart: !items?.length && useCart,
      });
      order = await persistOrder(userId, {
        shippingAddress: addr,
        snapshots,
        totalAmount,
        currency,
        paymentMethod,
        session,
      });
      if (paymentMethod === "COD") {
        await applyStockDeductionForOrder(order, session);
        order.inventoryReserved = true;
        await order.save({ session });
      }
    });
  } finally {
    await session.endSession();
  }
  return order;
};

const listMyOrders = async (userId, query = {}) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const filter = { user: userId, isDeleted: { $ne: true } };
  const st = query.orderStatus || query.status;
  if (st) filter.orderStatus = st;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(filter),
  ]);

  return {
    orders,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

const listAllOrders = async (query = {}) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = { isDeleted: { $ne: true } };
  const st = query.orderStatus || query.status;
  if (st) filter.orderStatus = st;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query.user) filter.user = query.user;
  if (query.search) {
    filter.orderNumber = { $regex: String(query.search).trim(), $options: "i" };
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "fullName email phone role"),
    Order.countDocuments(filter),
  ]);

  return {
    orders,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

const getOrderById = async (id, { userId = null, isAdmin = false } = {}) => {
  const order = await Order.findOne({ _id: id, isDeleted: { $ne: true } }).populate(
    "user",
    "fullName email phone role"
  );
  if (!order) throw new HttpError("Order not found", 404);

  if (!isAdmin && userId && String(order.user._id || order.user) !== String(userId)) {
    throw new HttpError("Order not found", 404);
  }
  return order;
};

const restockOrderItems = async (order, session) => {
  if (!order.inventoryReserved) return;
  const ops = order.items.map((line) => ({
    updateOne: {
      filter: { _id: line.product },
      update: {
        $inc: { stockQuantity: line.quantity, purchaseCount: -line.quantity },
      },
    },
  }));
  if (ops.length) await Product.bulkWrite(ops, { session });
};

const appendHistory = (order, status, note, actorUserId) => {
  order.orderStatusHistory.push({
    status,
    at: new Date(),
    note: note || (actorUserId ? `by ${actorUserId}` : ""),
  });
};

/** Appended to history notes when a refund / payment-refund state is set. */
const refundStateHistorySuffix = (order) =>
  `paymentStatus: ${order.paymentStatus ?? "?"} | refund.status: ${order.refund?.status ?? "NONE"}`;

const updateStatus = async (id, { status, note = "" }, { actorUserId }) => {
  const session = await mongoose.startSession();
  let updated;
  let didShip = false;
  let didDeliver = false;
  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({ _id: id, isDeleted: { $ne: true } }).session(session);
      if (!order) throw new HttpError("Order not found", 404);

      if (TERMINAL_ORDER_STATUSES.has(order.orderStatus)) {
        throw new HttpError(
          `Order is already ${order.orderStatus}; no further changes allowed.`,
          400
        );
      }
      const allowed = ORDER_STATUS_TRANSITIONS[order.orderStatus] || new Set();
      if (!allowed.has(status)) {
        throw new HttpError(`Cannot transition order from ${order.orderStatus} to ${status}`, 400);
      }

      if (status === "SHIPPED") {
        // BRS: "Courier company provides tracking details" must precede SHIPPED.
        const tn = order?.tracking?.trackingNumber?.trim();
        if (!tn) {
          throw new HttpError(
            "Tracking number is required before marking the order as SHIPPED. Set tracking via PATCH /orders/:id/tracking first.",
            400
          );
        }
        order.tracking.dispatchedAt = order.tracking.dispatchedAt || new Date();
        order.tracking.sharedWithUserAt = new Date();
        didShip = true;
      }

      if (status === "CANCELLED") {
        await restockOrderItems(order, session);
        order.inventoryReserved = false;
      }

      if (status === "DELIVERED") {
        if (order.paymentMethod === "COD" && order.paymentStatus === "PENDING") {
          order.paymentStatus = "PAID";
        }
        didDeliver = true;
      }

      if (order.orderType === "REPLACEMENT") {
        if (status === "SHIPPED") order.replacementStatus = "SHIPPED";
        if (status === "DELIVERED") order.replacementStatus = "DELIVERED";
      }

      order.orderStatus = status;
      appendHistory(order, status, note, actorUserId);
      await order.save({ session });
      updated = order;
    });
  } finally {
    await session.endSession();
  }

  // Post-commit, best-effort email fan-out. Failures are logged, never bubbled.
  if (updated && didShip) {
    orderEmailService
      .sendTrackingShared(updated)
      .catch((err) =>
        console.error(
          "[orderService] sendTrackingShared failed:",
          err?.message || err
        )
      );
  }
  if (updated && didDeliver) {
    orderEmailService
      .sendDeliveryConfirmationPrompt(updated)
      .catch((err) =>
        console.error(
          "[orderService] sendDeliveryConfirmationPrompt failed:",
          err?.message || err
        )
      );
  }

  // Always push the customer on a successful status transition. Best-effort,
  // never bubbled.
  if (updated) {
    if (status === "DELIVERED" && updated.orderType === "REPLACEMENT") {
      ReplacementRequest.findOneAndUpdate(
        { replacementOrder: updated._id, status: "APPROVED" },
        { $set: { status: "COMPLETED" } }
      ).catch((err) =>
        console.warn(
          "[orderService] ReplacementRequest COMPLETED sync failed:",
          err?.message || err
        )
      );
    }
    notifyOrderStatusChanged(updated.user, {
      order: updated,
      newStatus: status,
      note,
    }).catch((err) =>
      console.error(
        "[orderService] notifyOrderStatusChanged failed:",
        err?.message || err
      )
    );
  }

  return updated;
};

/**
 * Admin records / overwrites courier tracking details on an order. Does not
 * change orderStatus — admin still has to call `updateStatus` to flip to
 * SHIPPED (which then sends the tracking email).
 */
const adminSetTracking = async (
  id,
  { courier, trackingNumber, trackingUrl = "" },
  { actorUserId }
) => {
  if (!courier || !String(courier).trim()) {
    throw new HttpError("courier is required", 400);
  }
  if (!trackingNumber || !String(trackingNumber).trim()) {
    throw new HttpError("trackingNumber is required", 400);
  }

  const order = await Order.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!order) throw new HttpError("Order not found", 404);
  if (order.orderStatus === "CANCELLED") {
    throw new HttpError("Cannot set tracking on a cancelled order", 400);
  }

  order.tracking = {
    ...(order.tracking || {}),
    courier: String(courier).trim(),
    trackingNumber: String(trackingNumber).trim(),
    trackingUrl: trackingUrl ? String(trackingUrl).trim() : order.tracking?.trackingUrl || "",
  };
  appendHistory(
    order,
    order.orderStatus,
    `Tracking set: ${order.tracking.courier} / ${order.tracking.trackingNumber}`,
    actorUserId
  );
  await order.save();
  return order;
};

/**
 * Admin "dispatch" convenience: set tracking + transition to SHIPPED in one
 * call. Wraps `adminSetTracking` followed by `updateStatus("SHIPPED")`.
 */
const dispatchOrder = async (
  id,
  { courier, trackingNumber, trackingUrl = "", note = "" },
  { actorUserId }
) => {
  await adminSetTracking(
    id,
    { courier, trackingNumber, trackingUrl },
    { actorUserId }
  );
  return updateStatus(id, { status: "SHIPPED", note }, { actorUserId });
};

/**
 * Customer-side: confirm receipt after DELIVERED. If `satisfied === true` the
 * order moves to terminal FULFILLED. If false we record dissatisfaction but
 * keep the order in DELIVERED so the user can still file a request — the
 * mobile client should prompt them to open `/orders/:id/requests`.
 */
const confirmDelivery = async (id, userId, { satisfied, feedback = "" } = {}) => {
  if (typeof satisfied !== "boolean") {
    throw new HttpError("`satisfied` must be a boolean", 400);
  }
  const order = await Order.findOne({
    _id: id,
    user: userId,
    isDeleted: { $ne: true },
  });
  if (!order) throw new HttpError("Order not found", 404);
  if (!["DELIVERED", "FULFILLED"].includes(order.orderStatus)) {
    throw new HttpError(
      `Cannot confirm delivery while order is ${order.orderStatus}`,
      400
    );
  }
  if (order.orderStatus === "FULFILLED" && order.fulfillment?.satisfied === true) {
    return order;
  }

  order.fulfillment = {
    satisfied,
    ratedAt: new Date(),
    feedback: feedback ? String(feedback).slice(0, 2000) : "",
  };
  if (satisfied) {
    order.orderStatus = "FULFILLED";
    appendHistory(order, "FULFILLED", "Customer confirmed receipt", userId);
  } else {
    appendHistory(
      order,
      order.orderStatus,
      "Customer reported a problem with the delivery",
      userId
    );
  }
  await order.save();
  return order;
};

/**
 * Admin terminal cancellation — used by the request-approval flow as well as
 * by direct admin action. Allowed from any non-shipped, non-cancelled state.
 * Restocks items if inventory was deducted; sets paymentStatus from Paystack outcome.
 */
/**
 * Attempt a full-amount Paystack refund for a paid order. Pure side-effect on
 * the in-memory `order.refund` sub-doc — caller is responsible for `.save()`.
 *
 * Returns:
 *   { outcome: "REFUNDED" } — Paystack returned a terminal `processed` state.
 *   { outcome: "PENDING"  } — Paystack accepted the refund; awaiting webhook.
 *   { outcome: "FAILED", error } — Paystack rejected; admin must retry / settle manually.
 */
const attemptPaystackRefund = async (order, { reason = "" } = {}) => {
  if (!order.paystackReference) {
    return {
      outcome: "FAILED",
      error:
        "Order has no paystackReference; cannot auto-refund. Settle manually in Paystack.",
    };
  }
  try {
    const refundData = await paystackService.refundTransaction({
      reference: order.paystackReference,
      amountInMajor: order.totalAmount,
      currency: order.currency,
      merchantNote: reason
        ? `Admin cancel — ${reason}`.slice(0, 300)
        : "Admin cancel",
    });

    const paystackStatus = String(refundData?.status || "").toLowerCase();
    const isTerminalSuccess = paystackStatus === "processed";

    order.refund = {
      ...(order.refund || {}),
      status: isTerminalSuccess ? "PROCESSED" : "PENDING",
      paystackRefundId: refundData?.id != null ? String(refundData.id) : "",
      amount: order.totalAmount,
      currency: order.currency,
      attemptedAt: new Date(),
      processedAt: isTerminalSuccess ? new Date() : null,
      lastError: "",
    };
    return { outcome: isTerminalSuccess ? "REFUNDED" : "PENDING" };
  } catch (err) {
    const message = err?.message || String(err);
    order.refund = {
      ...(order.refund || {}),
      status: "FAILED",
      attemptedAt: new Date(),
      lastError: message.slice(0, 500),
    };
    return { outcome: "FAILED", error: message };
  }
};

const adminCancelOrder = async (id, { reason = "" } = {}, { actorUserId }) => {
  // 1) Quick guard — make sure the order is cancellable before any side-effect.
  const preCheck = await Order.findOne({ _id: id, isDeleted: { $ne: true } }).lean();
  if (!preCheck) throw new HttpError("Order not found", 404);
  if (["SHIPPED", "DELIVERED", "FULFILLED", "CANCELLED"].includes(preCheck.orderStatus)) {
    throw new HttpError(
      `Order is ${preCheck.orderStatus}; cancel is no longer possible.`,
      400
    );
  }

  // 2) If the order was PAID, try Paystack refund FIRST (outside any DB txn —
  //    network calls don't belong inside Mongo transactions).
  const wasPaid = preCheck.paymentStatus === "PAID";
  let refundOutcome = null;
  if (wasPaid) {
    const tmp = { paystackReference: preCheck.paystackReference, totalAmount: preCheck.totalAmount, currency: preCheck.currency, refund: preCheck.refund || {} };
    refundOutcome = await attemptPaystackRefund(tmp, { reason });
    // copy the refund block back; we'll re-apply on the live doc below.
    preCheck.refund = tmp.refund;
  }

  // 3) Commit the cancel + (conditionally) the refund flip in a single txn.
  const session = await mongoose.startSession();
  let order;
  let didRefund = false;
  let refundPending = false;
  let refundFailed = false;
  let refundError = null;
  try {
    await session.withTransaction(async () => {
      order = await Order.findOne({ _id: id, isDeleted: { $ne: true } }).session(session);
      if (!order) throw new HttpError("Order not found", 404);

      // Re-check status under transaction (race-safety).
      if (["SHIPPED", "DELIVERED", "FULFILLED", "CANCELLED"].includes(order.orderStatus)) {
        throw new HttpError(
          `Order is ${order.orderStatus}; cancel is no longer possible.`,
          400
        );
      }

      await restockOrderItems(order, session);
      order.inventoryReserved = false;

      if (wasPaid && refundOutcome) {
        // Persist the refund block we computed before the txn.
        order.refund = preCheck.refund;
        if (refundOutcome.outcome === "REFUNDED") {
          order.paymentStatus = "REFUNDED";
          didRefund = true;
        } else if (refundOutcome.outcome === "PENDING") {
          order.paymentStatus = "REFUND_INITIATED";
          refundPending = true;
        } else {
          order.paymentStatus = "REFUND_FAILED";
          refundFailed = true;
          refundError = refundOutcome.error;
        }
      }

      order.orderStatus = "CANCELLED";
      const baseNote = reason || "Cancelled by admin";
      const noteWithRefund = wasPaid
        ? refundOutcome.outcome === "REFUNDED"
          ? `${baseNote} | Paystack refund processed (${order.refund.paystackRefundId || "no-id"})`
          : refundOutcome.outcome === "PENDING"
            ? `${baseNote} | Paystack refund initiated, awaiting confirmation (${order.refund.paystackRefundId || "no-id"})`
            : `${baseNote} | Paystack refund FAILED: ${refundError || "unknown"} — settle manually`
        : baseNote;
      const noteWithRefundAndState =
        wasPaid && refundOutcome
          ? `${noteWithRefund} | ${refundStateHistorySuffix(order)}`
          : noteWithRefund;
      appendHistory(order, "CANCELLED", noteWithRefundAndState, actorUserId);
      await order.save({ session });
    });
  } finally {
    await session.endSession();
  }

  // 4) Post-commit best-effort fan-out: cancellation email + FCM push.
  if (order) {
    orderEmailService
      .sendOrderCancelledByAdmin(order, {
        reason,
        refunded: didRefund,
        refundPending,
        refundFailed,
        refundError,
      })
      .catch((err) =>
        console.error(
          "[orderService] sendOrderCancelledByAdmin failed:",
          err?.message || err
        )
      );

    notifyOrderStatusChanged(order.user, {
      order,
      newStatus: "CANCELLED",
      note: reason || "Cancelled by admin",
      body: reason
        ? `Order ${order.orderNumber} was cancelled: ${reason}`
        : undefined,
    }).catch((err) =>
      console.error(
        "[orderService] notifyOrderStatusChanged (admin cancel) failed:",
        err?.message || err
      )
    );
  }

  return order;
};

const cancelMyOrder = async (id, userId) => {
  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      order = await Order.findOne({ _id: id, user: userId }).session(session);
      if (!order) throw new HttpError("Order not found", 404);
      if (order.orderStatus !== "PLACED" || order.paymentStatus !== "PENDING") {
        throw new HttpError(
          "You can only cancel an unpaid order while it is still PLACED.",
          400
        );
      }
      await restockOrderItems(order, session);
      order.inventoryReserved = false;
      order.orderStatus = "CANCELLED";
      order.paymentStatus = "FAILED";
      appendHistory(order, "CANCELLED", "Cancelled by user", userId);
      await order.save({ session });
    });
  } finally {
    await session.endSession();
  }
  return order;
};

const updatePayment = async (
  id,
  { paymentStatus, paymentMethod },
  { actorUserId }
) => {
  const order = await Order.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!order) throw new HttpError("Order not found", 404);

  if (paymentMethod) order.paymentMethod = paymentMethod;
  if (paymentStatus) {
    order.paymentStatus = paymentStatus;
    appendHistory(order, order.orderStatus, `Payment marked ${paymentStatus}`, actorUserId);
  }

  await order.save();
  return order;
};

module.exports = {
  checkoutFromCart,
  createOrder,
  listMyOrders,
  listAllOrders,
  getOrderById,
  updateStatus,
  cancelMyOrder,
  updatePayment,
  adminSetTracking,
  dispatchOrder,
  confirmDelivery,
  adminCancelOrder,
  attemptPaystackRefund,
  _internal: {
    nextOrderNumber,
    buildOrderPayload,
    normalizeShippingAddress,
    restockOrderItems,
    applyStockDeductionForOrder,
  },
};
