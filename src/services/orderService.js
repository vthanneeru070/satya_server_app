const mongoose = require("mongoose");
const Order = require("../models/Order");
const User = require("../models/User");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Counter = require("../models/Counter");
const ReplacementRequest = require("../models/ReplacementRequest");
const inventoryService = require("./inventoryService");
const HttpError = require("../utils/httpError");
const { isAyurvedicCategory } = require("../validations/productValidation");
const orderEmailService = require("./orderEmailService");
const {
  notifyOrderStatusChanged,
  notifyRefundProcessed,
  ORDER_INBOX_TYPE_BY_STATUS,
} = require("./fcmOrderNotifyService");

/** Status changes that create a separate row in GET /user/notifications. */
const CUSTOMER_INBOX_NOTIFY_STATUSES = new Set([
  ...Object.keys(ORDER_INBOX_TYPE_BY_STATUS),
]);
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

const canTransitionOrderStatus = (fromStatus, toStatus, order) => {
  if (
    toStatus === "SHIPPED" &&
    fromStatus === "PLACED" &&
    order?.tracking?.trackingNumber?.trim()
  ) {
    return true;
  }
  return (ORDER_STATUS_TRANSITIONS[fromStatus] || new Set()).has(toStatus);
};

const loadOrderForCustomerNotify = (orderId) =>
  Order.findById(orderId)
    .select("user orderNumber orderStatus orderType replacementFor")
    .lean();

const notifyCustomerOrderStatus = (
  orderId,
  { newStatus, note = "", title, body } = {}
) => {
  loadOrderForCustomerNotify(orderId)
    .then((order) => {
      if (!order?.user) {
        console.warn(
          `[orderService] notifyCustomerOrderStatus: order ${orderId} has no user`
        );
        return null;
      }
      return notifyOrderStatusChanged(order.user, {
        order,
        newStatus,
        note,
        title,
        body,
      });
    })
    .catch((err) =>
      console.error(
        "[orderService] notifyCustomerOrderStatus failed:",
        err?.message || err
      )
    );
};

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

const assertProductBuyable = (product) => {
  if (!product || product.isDeleted) {
    throw new HttpError("Product not found", 404);
  }
  if (product.status !== "APPROVED" || product.productStatus !== "ACTIVE") {
    throw new HttpError("This product is not available right now", 400);
  }
  if (!isAyurvedicCategory(product.category) && !product.items?.length) {
    throw new HttpError(`"${product.title}" has no inventory kit configured`, 400);
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
  const invIds = [];
  for (const p of products) {
    for (const line of p.items || []) {
      if (line.inventoryItem) invIds.push(line.inventoryItem);
    }
  }
  const invMap = await inventoryService.loadInventoryMap(invIds);

  const snapshots = [];
  let totalAmount = 0;
  let currency = "ZAR";

  for (const r of requested) {
    const product = productMap.get(r.productId);
    assertProductBuyable(product);
    inventoryService.assertKitStockForOrder(product, r.quantity, invMap);
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
  const productMap = await inventoryService.loadProductsForOrderLines(order.items, session);
  const invIds = [];
  for (const p of productMap.values()) {
    for (const line of p.items || []) {
      if (line.inventoryItem) invIds.push(line.inventoryItem);
    }
  }
  const invMap = await inventoryService.loadInventoryMap(invIds);
  for (const line of order.items) {
    const product = productMap.get(String(line.product));
    if (!product) throw new HttpError("Product not found", 404);
    inventoryService.assertKitStockForOrder(product, line.quantity, invMap);
  }
  await inventoryService.applyInventoryDeductionForOrder(order, productMap, session);
  const productOps = order.items.map((line) => ({
    updateOne: {
      filter: { _id: line.product, isDeleted: { $ne: true } },
      update: { $inc: { purchaseCount: line.quantity } },
    },
  }));
  if (productOps.length) await Product.bulkWrite(productOps, { session });
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
  const productMap = await inventoryService.loadProductsForOrderLines(order.items, session);
  await inventoryService.restockInventoryForOrder(order, productMap, session);
  const productOps = order.items.map((line) => ({
    updateOne: {
      filter: { _id: line.product },
      update: { $inc: { purchaseCount: -line.quantity } },
    },
  }));
  if (productOps.length) await Product.bulkWrite(productOps, { session });
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

const buildRefundedBy = async (adminUserId) => {
  if (!adminUserId) return null;
  const admin = await User.findById(adminUserId).select("fullName email").lean();
  if (!admin) return null;
  return {
    adminId: admin._id,
    fullName: admin.fullName || "",
    email: admin.email || "",
  };
};

const mergeRefundAudit = (order, { reason = "", adminNote = "", refundedBy = null } = {}) => {
  const prev = order.refund || {};
  order.refund = {
    ...prev,
    reason: String(reason ?? prev.reason ?? "").trim().slice(0, 2000),
    adminNote: String(adminNote ?? prev.adminNote ?? "").trim().slice(0, 2000),
    refundedBy: refundedBy !== undefined ? refundedBy : prev.refundedBy ?? null,
  };
};

const updateStatus = async (
  id,
  { status, note = "", skipNotify = false },
  { actorUserId }
) => {
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
      if (!canTransitionOrderStatus(order.orderStatus, status, order)) {
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
    if (updated.orderType === "REPLACEMENT" && status === "SHIPPED") {
      ReplacementRequest.findOneAndUpdate(
        { replacementOrder: updated._id, status: { $in: ["APPROVED", "PROCESSING", "PENDING"] } },
        { $set: { status: "SHIPPED" } }
      ).catch((err) =>
        console.warn(
          "[orderService] ReplacementRequest SHIPPED sync failed:",
          err?.message || err
        )
      );
    }
    if (updated.orderType === "REPLACEMENT" && status === "DELIVERED") {
      ReplacementRequest.findOneAndUpdate(
        { replacementOrder: updated._id },
        { $set: { status: "DELIVERED", completedAt: new Date() } },
        { new: true }
      )
        .then((reqDoc) => {
          if (reqDoc && updated.replacementFor) {
            return Order.updateOne(
              { _id: updated.replacementFor, isDeleted: { $ne: true } },
              { $set: { replacementState: "COMPLETED" } }
            );
          }
          return null;
        })
        .catch((err) =>
          console.warn(
            "[orderService] ReplacementRequest DELIVERED / original COMPLETED sync failed:",
            err?.message || err
          )
        );
    }
    if (!skipNotify && CUSTOMER_INBOX_NOTIFY_STATUSES.has(status)) {
      notifyCustomerOrderStatus(updated._id, { newStatus: status, note });
    }
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

  const current = await Order.findOne({ _id: id, isDeleted: { $ne: true } })
    .select("orderStatus")
    .lean();
  if (!current) throw new HttpError("Order not found", 404);

  // Paid orders often stay PLACED until dispatch; advance to PROCESSING first.
  if (current.orderStatus === "PLACED") {
    await updateStatus(
      id,
      {
        status: "PROCESSING",
        note: note || "Preparing for dispatch",
        skipNotify: true,
      },
      { actorUserId }
    );
  }

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

  if (satisfied) {
    notifyCustomerOrderStatus(order._id, {
      newStatus: "FULFILLED",
      note: "Customer confirmed receipt",
    });
  }

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
const attemptPaystackRefund = async (
  order,
  { reason = "", refundAudit = null } = {}
) => {
  if (!order.paystackReference) {
    if (refundAudit) mergeRefundAudit(order, refundAudit);
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
      merchantNote: reason ? String(reason).slice(0, 300) : "Admin refund",
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
    if (refundAudit) mergeRefundAudit(order, refundAudit);
    return { outcome: isTerminalSuccess ? "REFUNDED" : "PENDING" };
  } catch (err) {
    const message = err?.message || String(err);
    order.refund = {
      ...(order.refund || {}),
      status: "FAILED",
      attemptedAt: new Date(),
      lastError: message.slice(0, 500),
    };
    if (refundAudit) mergeRefundAudit(order, refundAudit);
    return { outcome: "FAILED", error: message };
  }
};

/**
 * Replacement shipments reuse the original Paystack charge (`paymentStatus: PAID`
 * with no new payment). Cancelling them must not call Paystack refund.
 */
const syncReplacementOrderCancelled = async (replacementOrder, { reason = "" } = {}) => {
  if (!replacementOrder || replacementOrder.orderType !== "REPLACEMENT") return;

  const cancellationReason = reason ? String(reason).trim().slice(0, 2000) : "";

  await ReplacementRequest.findOneAndUpdate(
    { replacementOrder: replacementOrder._id },
    {
      $set: {
        status: "CANCELLED",
        cancellationReason,
        completedAt: new Date(),
      },
    }
  ).catch((err) =>
    console.warn(
      "[orderService] ReplacementRequest CANCELLED sync failed:",
      err?.message || err
    )
  );

  if (replacementOrder.replacementFor) {
    await Order.updateOne(
      { _id: replacementOrder.replacementFor, isDeleted: { $ne: true } },
      { $set: { replacementState: "NONE", latestReplacementOrder: null } }
    ).catch((err) =>
      console.warn(
        "[orderService] original order replacementState (cancel) update failed:",
        err?.message || err
      )
    );
  }
};

/**
 * Cancel before shipment. User: PLACED/PROCESSING only + auto Paystack refund if PAID.
 * Admin: any status except SHIPPED/DELIVERED/FULFILLED/CANCELLED.
 */
const executeOrderCancellation = async (
  id,
  { userId = null, actorUserId, reason = "", mode = "admin" } = {}
) => {
  const filter = { _id: id, isDeleted: { $ne: true } };
  if (userId) filter.user = userId;

  const preCheck = await Order.findOne(filter).lean();
  if (!preCheck) throw new HttpError("Order not found", 404);

  if (mode === "user") {
    if (!["PLACED", "PROCESSING"].includes(preCheck.orderStatus)) {
      throw new HttpError(
        `You can only cancel before the order ships (current status: ${preCheck.orderStatus}).`,
        400
      );
    }
  } else if (["SHIPPED", "DELIVERED", "FULFILLED", "CANCELLED"].includes(preCheck.orderStatus)) {
    throw new HttpError(
      `Order is ${preCheck.orderStatus}; cancel is no longer possible.`,
      400
    );
  }

  if (["REFUND_INITIATED", "REFUNDED"].includes(preCheck.paymentStatus)) {
    throw new HttpError(
      preCheck.paymentStatus === "REFUNDED"
        ? "This order has already been refunded."
        : "A refund is already in progress for this order.",
      400
    );
  }

  const isReplacementShipment = preCheck.orderType === "REPLACEMENT";
  const wasPaid = preCheck.paymentStatus === "PAID" && !isReplacementShipment;
  const trimmedCancelReason = String(reason || "").trim().slice(0, 2000);
  let refundOutcome = null;
  if (wasPaid) {
    const tmp = {
      paystackReference: preCheck.paystackReference,
      totalAmount: preCheck.totalAmount,
      currency: preCheck.currency,
      refund: preCheck.refund || {},
    };
    const cancelRefundNote =
      mode === "user"
        ? trimmedCancelReason
          ? `User cancel — ${trimmedCancelReason}`.slice(0, 300)
          : "User cancel"
        : trimmedCancelReason
          ? `Admin cancel — ${trimmedCancelReason}`.slice(0, 300)
          : "Admin cancel";
    const refundedBy = mode === "admin" ? await buildRefundedBy(actorUserId) : null;
    refundOutcome = await attemptPaystackRefund(tmp, {
      reason: cancelRefundNote,
      refundAudit: {
        reason: trimmedCancelReason,
        adminNote: "",
        refundedBy,
      },
    });
    preCheck.refund = tmp.refund;
  }

  const session = await mongoose.startSession();
  let order;
  let didRefund = false;
  let refundPending = false;
  let refundFailed = false;
  let refundError = null;
  try {
    await session.withTransaction(async () => {
      order = await Order.findOne(filter).session(session);
      if (!order) throw new HttpError("Order not found", 404);

      if (mode === "user") {
        if (!["PLACED", "PROCESSING"].includes(order.orderStatus)) {
          throw new HttpError(
            `You can only cancel before the order ships (current status: ${order.orderStatus}).`,
            400
          );
        }
      } else if (["SHIPPED", "DELIVERED", "FULFILLED", "CANCELLED"].includes(order.orderStatus)) {
        throw new HttpError(
          `Order is ${order.orderStatus}; cancel is no longer possible.`,
          400
        );
      }

      await restockOrderItems(order, session);
      order.inventoryReserved = false;

      if (wasPaid && refundOutcome) {
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
      } else if (!wasPaid) {
        order.paymentStatus = "FAILED";
      }

      order.orderStatus = "CANCELLED";
      const trimmedReason = String(reason || "").trim().slice(0, 2000);
      order.cancelOrder = {
        canceledBy: mode === "user" ? "user" : "admin",
        cancelReason: trimmedReason,
        canceledAt: new Date(),
      };
      const defaultNote = mode === "user" ? "Cancelled by user" : "Cancelled by admin";
      const baseNote = trimmedReason || defaultNote;
      const replacementNote = isReplacementShipment
        ? `${baseNote} | Replacement shipment cancelled — no Paystack refund (no separate charge)`
        : baseNote;
      const noteWithRefund = wasPaid
        ? refundOutcome.outcome === "REFUNDED"
          ? `${replacementNote} | Paystack refund processed (${order.refund.paystackRefundId || "no-id"})`
          : refundOutcome.outcome === "PENDING"
            ? `${replacementNote} | Paystack refund initiated, awaiting confirmation (${order.refund.paystackRefundId || "no-id"})`
            : `${replacementNote} | Paystack refund FAILED: ${refundError || "unknown"} — settle manually`
        : replacementNote;
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

  if (order) {
    if (order.orderType === "REPLACEMENT") {
      syncReplacementOrderCancelled(order, { reason }).catch(() => {});
    }

    orderEmailService
      .sendOrderCancelledByAdmin(order, {
        reason,
        refunded: didRefund,
        refundPending,
        refundFailed,
        refundError,
        byUser: mode === "user",
      })
      .catch((err) =>
        console.error(
          "[orderService] order cancellation email failed:",
          err?.message || err
        )
      );

    const cancelNote = reason || (mode === "user" ? "Cancelled by you" : "Cancelled by admin");
    notifyCustomerOrderStatus(order._id, {
      newStatus: "CANCELLED",
      note: cancelNote,
      body: reason
        ? `Order ${order.orderNumber} was cancelled: ${reason}`
        : `Order ${order.orderNumber} was cancelled.`,
    });
  }

  return order;
};

/**
 * Admin-initiated full Paystack refund (no user OrderRequest required).
 * Order stays at its current orderStatus; only payment/refund fields change.
 */
const adminInitiateRefund = async (
  id,
  { reason = "", adminNote = "" } = {},
  { actorUserId } = {}
) => {
  const order = await Order.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!order) throw new HttpError("Order not found", 404);

  if (order.orderType === "REPLACEMENT") {
    throw new HttpError(
      "Replacement orders share the original charge. Refund the original order instead.",
      400
    );
  }
  if (order.paymentStatus === "REFUND_INITIATED") {
    throw new HttpError("A refund is already in progress for this order.", 400);
  }
  if (order.paymentStatus === "REFUNDED") {
    throw new HttpError("Order is already refunded.", 400);
  }
  if (order.paymentStatus !== "PAID" && order.paymentStatus !== "REFUND_FAILED") {
    throw new HttpError(
      `Refund is only allowed for paid orders (current paymentStatus: ${order.paymentStatus}).`,
      400
    );
  }

  const trimmedReason = String(reason || "").trim().slice(0, 2000);
  const trimmedAdminNote = String(adminNote || "").trim().slice(0, 2000);
  const refundedBy = await buildRefundedBy(actorUserId);
  const parts = [trimmedAdminNote, trimmedReason].filter(Boolean);
  const paystackNote = parts.length
    ? `Admin refund — ${parts.join(" — ")}`.slice(0, 300)
    : "Admin-initiated refund";

  const refundOutcome = await attemptPaystackRefund(order, {
    reason: paystackNote,
    refundAudit: {
      reason: trimmedReason,
      adminNote: trimmedAdminNote,
      refundedBy,
    },
  });

  if (refundOutcome.outcome === "REFUNDED") {
    order.paymentStatus = "REFUNDED";
  } else if (refundOutcome.outcome === "PENDING") {
    order.paymentStatus = "REFUND_INITIATED";
  } else {
    order.paymentStatus = "REFUND_FAILED";
  }

  const refundNoteBase =
    refundOutcome.outcome === "REFUNDED"
      ? `Admin refund processed (paystack ${order.refund?.paystackRefundId || "no-id"})`
      : refundOutcome.outcome === "PENDING"
        ? "Admin refund initiated, awaiting Paystack confirmation"
        : `Admin refund FAILED via Paystack: ${refundOutcome.error || "unknown"} — settle manually`;

  appendHistory(
    order,
    order.orderStatus,
    `${refundNoteBase} | ${refundStateHistorySuffix(order)}`,
    actorUserId
  );
  await order.save();

  if (refundOutcome.outcome === "REFUNDED") {
    orderEmailService.sendRefundProcessed(order).catch((err) =>
      console.error("[orderService] sendRefundProcessed failed:", err?.message || err)
    );
    notifyRefundProcessed(order.user, { order }).catch(() => {});
  }

  return {
    order,
    refund: {
      outcome: refundOutcome.outcome,
      error: refundOutcome.error || null,
      paystackRefundId: order.refund?.paystackRefundId || null,
    },
  };
};

const adminCancelOrder = async (id, { reason = "" } = {}, { actorUserId }) =>
  executeOrderCancellation(id, { actorUserId, reason, mode: "admin" });

const cancelMyOrder = async (id, userId, { reason = "" } = {}) =>
  executeOrderCancellation(id, {
    userId,
    actorUserId: userId,
    reason: String(reason || "").trim().slice(0, 2000),
    mode: "user",
  });

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
  adminInitiateRefund,
  attemptPaystackRefund,
  _internal: {
    nextOrderNumber,
    buildOrderPayload,
    normalizeShippingAddress,
    restockOrderItems,
    applyStockDeductionForOrder,
  },
};
