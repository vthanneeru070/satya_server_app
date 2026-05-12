const mongoose = require("mongoose");
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Counter = require("../models/Counter");
const HttpError = require("../utils/httpError");

const ORDER_STATUS_TRANSITIONS = {
  PLACED: new Set(["PROCESSING", "CANCELLED"]),
  PROCESSING: new Set(["SHIPPED", "CANCELLED"]),
  SHIPPED: new Set(["DELIVERED"]),
  DELIVERED: new Set(),
  CANCELLED: new Set(),
};

const TERMINAL_ORDER_STATUSES = new Set(["DELIVERED", "CANCELLED"]);

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
  const doc = await Counter.findOneAndUpdate(
    { _id: "orderSequence" },
    [{ $set: { seq: { $add: [{ $ifNull: ["$seq", 10000] }, 1] } } }],
    { new: true, upsert: true, session }
  );
  return `SATYA-${doc.seq}`;
};

const assertProductBuyable = (product, requestedQty) => {
  if (!product || product.isDeleted) {
    throw new HttpError("Product not found", 404);
  }
  if (product.status !== "ACTIVE") {
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

const updateStatus = async (id, { status, note = "" }, { actorUserId }) => {
  const session = await mongoose.startSession();
  let updated;
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

      if (status === "CANCELLED") {
        await restockOrderItems(order, session);
        order.inventoryReserved = false;
      }

      if (status === "DELIVERED") {
        if (order.paymentMethod === "COD" && order.paymentStatus === "PENDING") {
          order.paymentStatus = "PAID";
        }
      }

      order.orderStatus = status;
      appendHistory(order, status, note, actorUserId);
      await order.save({ session });
      updated = order;
    });
  } finally {
    await session.endSession();
  }
  return updated;
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
  _internal: {
    nextOrderNumber,
    buildOrderPayload,
    normalizeShippingAddress,
    restockOrderItems,
  },
};
