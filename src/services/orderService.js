const mongoose = require("mongoose");
const crypto = require("crypto");
const Order = require("../models/Order");
const User = require("../models/User");
const Payment = require("../models/Payment");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Counter = require("../models/Counter");
const ReplacementRequest = require("../models/ReplacementRequest");
const inventoryService = require("./inventoryService");
const HttpError = require("../utils/httpError");
const { usesProductQuantity } = require("../validations/productValidation");
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
const payfastService = require("./payfastService");
const ecommerceSettingsService = require("./ecommerceSettingsService");
const shippingQuoteService = require("./shippingQuoteService");
const shippingShipmentService = require("./shippingShipmentService");
const shippingPodService = require("./shippingPodService");
const warehouseRoutingService = require("./warehouseRoutingService");
const pickupCredentialService = require("./pickupCredentialService");

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const generatePickupCollectionCode = () =>
  String(crypto.randomInt(100000, 1000000));

const ensurePickupCollectionCode = async (order) => {
  if (order.pickupCollection?.code) {
    return order.pickupCollection.code;
  }
  const code = generatePickupCollectionCode();
  order.pickupCollection = {
    code,
    generatedAt: new Date(),
  };
  await order.save();
  return code;
};

const buildOrderSearchFilter = async (searchTerm) => {
  const trimmed = String(searchTerm || "").trim();
  if (!trimmed) return null;

  const safe = escapeRegex(trimmed);
  const orClauses = [
    { orderNumber: { $regex: safe, $options: "i" } },
    { paystackReference: { $regex: safe, $options: "i" } },
    { transactionId: { $regex: safe, $options: "i" } },
    { originalPaystackReference: { $regex: safe, $options: "i" } },
    { originalTransactionId: { $regex: safe, $options: "i" } },
  ];

  if (/^[a-f0-9]{24}$/i.test(trimmed)) {
    orClauses.push({ _id: trimmed });
  }

  const [matchingUsers, matchingPayments] = await Promise.all([
    User.find({
      $or: [
        { fullName: { $regex: safe, $options: "i" } },
        { email: { $regex: safe, $options: "i" } },
      ],
    })
      .select("_id")
      .lean(),
    Payment.find({
      paymentFor: "ORDER",
      isDeleted: { $ne: true },
      order: { $ne: null },
      $or: [
        { reference: { $regex: safe, $options: "i" } },
        { transactionId: { $regex: safe, $options: "i" } },
        { paymentId: { $regex: safe, $options: "i" } },
      ],
    })
      .select("order")
      .lean(),
  ]);

  if (matchingUsers.length) {
    orClauses.push({ user: { $in: matchingUsers.map((u) => u._id) } });
  }

  const paymentOrderIds = matchingPayments.map((p) => p.order).filter(Boolean);
  if (paymentOrderIds.length) {
    orClauses.push({ _id: { $in: paymentOrderIds } });
  }

  return { $or: orClauses };
};

const ORDER_STATUS_TRANSITIONS = {
  PLACED: new Set(["PROCESSING", "CANCELLED"]),
  PROCESSING: new Set(["SHIPPED", "READY_FOR_PICKUP", "PACKED", "CANCELLED"]),
  PACKED: new Set(["READY_FOR_PICKUP", "CANCELLED"]),
  READY_FOR_PICKUP: new Set(["COLLECTED"]),
  COLLECTED: new Set(["FULFILLED"]),
  SHIPPED: new Set(["OUT_FOR_DELIVERY", "DELIVERED"]),
  OUT_FOR_DELIVERY: new Set(["DELIVERED"]),
  // DELIVERED → FULFILLED is driven by user `confirmDelivery({ satisfied: true })`.
  DELIVERED: new Set(["FULFILLED"]),
  FULFILLED: new Set(),
  CANCELLED: new Set(),
};

const TERMINAL_ORDER_STATUSES = new Set(["FULFILLED", "CANCELLED"]);

const canTransitionOrderStatus = (fromStatus, toStatus, order) => {
  const method = order?.fulfillmentMethod || "DELIVERY";

  if (toStatus === "SHIPPED" && method === "PICKUP") {
    return false;
  }
  if (toStatus === "READY_FOR_PICKUP" && method !== "PICKUP") {
    return false;
  }
  if (toStatus === "PACKED" && method !== "PICKUP") {
    return false;
  }
  if (toStatus === "COLLECTED" && method !== "PICKUP") {
    return false;
  }
  if (["SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"].includes(toStatus) && method === "PICKUP") {
    return false;
  }
  if (
    toStatus === "SHIPPED" &&
    fromStatus === "PLACED" &&
    order?.tracking?.trackingNumber?.trim()
  ) {
    return true;
  }
  // Pickup: allow PLACED → READY_FOR_PICKUP via PROCESSING hop in readyForPickup helper.
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
  const lat = raw.lat != null ? Number(raw.lat) : null;
  const lng = raw.lng != null ? Number(raw.lng) : null;
  return {
    fullName: raw.fullName,
    phone: raw.phone,
    addressLine1: raw.addressLine1 || raw.line1,
    addressLine2: raw.addressLine2 || raw.line2 || "",
    city: raw.city,
    state: raw.state,
    suburb: raw.suburb || raw.localArea || raw.local_area || "",
    localArea: raw.localArea || raw.local_area || raw.suburb || "",
    enteredAddress: raw.enteredAddress || raw.entered_address || "",
    country: raw.country || "South Africa",
    postalCode: raw.postalCode || raw.pincode,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
};

const assertShippingComplete = (addr) => {
  const required = ["fullName", "phone", "addressLine1", "city", "state", "postalCode"];
  const missing = required.filter((k) => !addr[k] || String(addr[k]).trim() === "");
  if (missing.length) {
    throw new HttpError(`shippingAddress missing: ${missing.join(", ")}`, 400);
  }
};

const assertPickupContact = (contact = {}) => {
  const fullName = contact.fullName || contact.name;
  const phone = contact.phone || contact.mobile_number;
  if (!fullName || !String(fullName).trim()) {
    throw new HttpError("contact.fullName is required for pickup", 400);
  }
  if (!phone || !String(phone).trim()) {
    throw new HttpError("contact.phone is required for pickup", 400);
  }
  return {
    fullName: String(fullName).trim(),
    phone: String(phone).trim(),
  };
};

const nextOrderNumber = async (session) => {
  // Pipeline update + upsert: starts at 10001 on first call, increments thereafter.
  // Mongoose 9+ requires `updatePipeline: true` to accept an aggregation pipeline.
  const doc = await Counter.findOneAndUpdate(
    { _id: "orderSequence" },
    [{ $set: { seq: { $add: [{ $ifNull: ["$seq", 10000] }, 1] } } }],
    { returnDocument: "after", upsert: true, session, updatePipeline: true }
  );
  return `SATHYA-${doc.seq}`;
};

const assertProductBuyable = (product) => {
  if (!product || product.isDeleted) {
    throw new HttpError("Product not found", 404);
  }
  if (product.status !== "APPROVED" || product.productStatus !== "ACTIVE") {
    throw new HttpError("This product is not available right now", 400);
  }
  if (!usesProductQuantity(product.category) && !product.items?.length) {
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

  return { snapshots, subtotal: totalAmount, currency, products: [...productMap.values()] };
};

const applyDeliveryToCheckout = async ({ snapshots, subtotal, currency }) => {
  const totals = await ecommerceSettingsService.attachDeliveryTotals(subtotal, currency);
  return {
    snapshots,
    subtotal: totals.subtotal,
    deliveryCharge: totals.deliveryCharge,
    totalAmount: totals.totalAmount,
    currency: totals.currency,
  };
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
  {
    shippingAddress,
    snapshots,
    subtotal,
    deliveryCharge,
    totalAmount,
    currency,
    paymentMethod,
    fulfillmentMethod = "DELIVERY",
    shippingQuote = undefined,
    pickupLocation = undefined,
    warehouseId = undefined,
    session,
  }
) => {
  const orderNumber = await nextOrderNumber(session);
  const [order] = await Order.create(
    [
      {
        orderNumber,
        user: userId,
        items: snapshots,
        subtotal,
        deliveryCharge,
        totalAmount,
        currency,
        paymentStatus: "PENDING",
        orderStatus: "PLACED",
        paymentMethod: paymentMethod || "PAYFAST",
        fulfillmentMethod,
        orderType: "NORMAL",
        shippingAddress,
        shippingQuote,
        pickupLocation,
        warehouse: warehouseId || null,
        inventoryReserved: false,
        orderStatusHistory: [{ status: "PLACED", at: new Date(), note: "Order created" }],
      },
    ],
    { session }
  );
  return order;
};

const resolveFulfillmentCheckout = async ({
  fulfillmentMethod,
  shippingAddress,
  shippingServiceLevelCode,
  contact,
  linePayload,
}) => {
  const method = String(fulfillmentMethod || "DELIVERY").toUpperCase();
  if (method !== "DELIVERY" && method !== "PICKUP") {
    throw new HttpError("fulfillmentMethod must be DELIVERY or PICKUP", 400);
  }

  if (method === "PICKUP") {
    const pickupContact = assertPickupContact(
      contact || {
        fullName: shippingAddress?.fullName,
        phone: shippingAddress?.phone,
      }
    );
    const routed = await warehouseRoutingService.resolveWarehouseForProducts(
      linePayload.products || []
    );
    const pickupLocation = routed.pickupLocation;
    const subtotal = linePayload.subtotal;
    return {
      fulfillmentMethod: "PICKUP",
      shippingAddress: {
        fullName: pickupContact.fullName,
        phone: pickupContact.phone,
        addressLine1: pickupLocation.streetAddress || "Pickup",
        addressLine2: "",
        city: pickupLocation.city || "—",
        state: pickupLocation.zone || "—",
        country: pickupLocation.country || "South Africa",
        postalCode: pickupLocation.postalCode || "0000",
        suburb: pickupLocation.localArea || "",
        localArea: pickupLocation.localArea || "",
        enteredAddress: pickupLocation.enteredAddress || "",
        lat: routed.warehouse?.lat ?? null,
        lng: routed.warehouse?.lng ?? null,
      },
      shippingQuote: undefined,
      pickupLocation,
      warehouseId: routed.warehouseId,
      snapshots: linePayload.snapshots,
      subtotal,
      deliveryCharge: 0,
      totalAmount: subtotal,
      currency: linePayload.currency,
    };
  }

  const addr = normalizeShippingAddress(shippingAddress);
  assertShippingComplete(addr);
  const declaredValue = linePayload.subtotal;
  const totals = await shippingQuoteService.resolveCheckoutDeliveryTotals({
    shippingAddress: addr,
    serviceLevelCode: shippingServiceLevelCode,
    subtotal: linePayload.subtotal,
    currency: linePayload.currency,
    declaredValue,
  });

  return {
    fulfillmentMethod: "DELIVERY",
    shippingAddress: addr,
    shippingQuote: totals.shippingQuote,
    pickupLocation: undefined,
    snapshots: linePayload.snapshots,
    subtotal: totals.subtotal,
    deliveryCharge: totals.deliveryCharge,
    totalAmount: totals.totalAmount,
    currency: totals.currency,
  };
};

/**
 * Checkout from cart only (canonical flow). Does not modify inventory or clear cart.
 */
const checkoutFromCart = async (
  userId,
  {
    shippingAddress,
    fulfillmentMethod = "DELIVERY",
    shippingServiceLevelCode,
    contact,
  } = {}
) => {
  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      const linePayload = await buildOrderPayload(userId, {
        useCart: true,
      });
      const fulfilled = await resolveFulfillmentCheckout({
        fulfillmentMethod,
        shippingAddress,
        shippingServiceLevelCode,
        contact,
        linePayload,
      });
      order = await persistOrder(userId, {
        ...fulfilled,
        paymentMethod: "PAYFAST",
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
    paymentMethod = "PAYFAST",
    useCart = true,
    fulfillmentMethod = "DELIVERY",
    shippingServiceLevelCode,
    contact,
  } = {}
) => {
  const session = await mongoose.startSession();
  let order;
  try {
    await session.withTransaction(async () => {
      const linePayload = await buildOrderPayload(userId, {
        items,
        useCart: !items?.length && useCart,
      });
      const fulfilled = await resolveFulfillmentCheckout({
        fulfillmentMethod,
        shippingAddress,
        shippingServiceLevelCode,
        contact,
        linePayload,
      });
      order = await persistOrder(userId, {
        ...fulfilled,
        paymentMethod,
        session,
      });
      if (paymentMethod === "COD") {
        await applyStockDeductionForOrder(order, session);
        order.inventoryReserved = true;
        if (order.fulfillmentMethod === "PICKUP") {
          const pin = pickupCredentialService.generatePickupPin();
          const issuedAt = new Date();
          order.pickupCollection = { code: pin, generatedAt: issuedAt };
          order.pickupCredentials = {
            pin,
            qrToken: pickupCredentialService.generateQrToken(order._id, pin),
            issuedAt,
            collectedAt: null,
            collectedBy: null,
          };
        }
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
  if (query.fulfillmentMethod) filter.fulfillmentMethod = query.fulfillmentMethod;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(
        "latestReplacementRequest",
        "requestNumber status fulfillmentMethod affectedItems returnShipment.status returnShipment.method returnShipment.instructions returnShipment.waybill returnShipment.shortTrackingReference returnShipment.trackingUrl returnShipment.labelUrl returnShipment.courierStatus returnShipment.shipmentId replacementOrder"
      ),
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
  if (query.fulfillmentMethod) filter.fulfillmentMethod = query.fulfillmentMethod;
  if (query.user) filter.user = query.user;
  if (query.search) {
    const searchFilter = await buildOrderSearchFilter(query.search);
    if (searchFilter) Object.assign(filter, searchFilter);
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
  const order = await Order.findOne({ _id: id, isDeleted: { $ne: true } })
    .populate("user", "fullName email phone role")
    .populate(
      "latestReplacementRequest",
      "requestNumber status fulfillmentMethod affectedItems returnShipment.status returnShipment.method returnShipment.instructions returnShipment.waybill returnShipment.shortTrackingReference returnShipment.trackingUrl returnShipment.labelUrl returnShipment.courierStatus returnShipment.shipmentId replacementOrder"
    );
  if (!order) throw new HttpError("Order not found", 404);

  if (!isAdmin && userId && String(order.user._id || order.user) !== String(userId)) {
    throw new HttpError("Order not found", 404);
  }
  if (isAdmin) {
    await shippingShipmentService.ensureOutboundDeliveryAddressSnapshots(order);
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
        const method = order.fulfillmentMethod || "DELIVERY";
        if (method === "DELIVERY") {
          // BRS: "Courier company provides tracking details" must precede SHIPPED.
          const tn = order?.tracking?.trackingNumber?.trim();
          if (!tn) {
            throw new HttpError(
              "Tracking number is required before marking the order as SHIPPED. Set tracking via PATCH /orders/:id/tracking first, or use dispatch to book The Courier Guy.",
              400
            );
          }
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
        {
          replacementOrder: updated._id,
          status: {
            $in: [
              "APPROVED",
              "AWAITING_RETURN",
              "RETURN_RECEIVED",
              "PROCESSING",
              "PENDING",
            ],
          },
        },
        { $set: { status: "SHIPPED" } }
      ).catch((err) =>
        console.warn(
          "[orderService] ReplacementRequest SHIPPED sync failed:",
          err?.message || err
        )
      );
    }
    if (
      updated.orderType === "REPLACEMENT" &&
      (status === "DELIVERED" || status === "FULFILLED")
    ) {
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
 * Admin "dispatch" convenience.
 * - Delivery: book The Courier Guy (if not already booked) unless manual tracking
 *   fields are provided, then transition to SHIPPED.
 * - Pickup: rejected — use readyForPickup instead.
 */
const dispatchOrder = async (
  id,
  { courier, trackingNumber, trackingUrl = "", note = "", bookCourier = true } = {},
  { actorUserId }
) => {
  const existing = await Order.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!existing) throw new HttpError("Order not found", 404);

  await require("./replacementService").assertReplacementFulfillmentAllowed(existing);

  if (existing.fulfillmentMethod === "PICKUP") {
    throw new HttpError(
      "Pickup orders cannot be dispatched via courier. Use POST /orders/:id/ready-for-pickup.",
      400
    );
  }

  const hasManualTracking =
    courier &&
    String(courier).trim() &&
    trackingNumber &&
    String(trackingNumber).trim();

  if (hasManualTracking) {
    await adminSetTracking(
      id,
      { courier, trackingNumber, trackingUrl },
      { actorUserId }
    );
  } else if (bookCourier !== false) {
    await shippingShipmentService.bookShipmentForOrder(existing, { actorUserId });
    existing.orderStatusHistory = existing.orderStatusHistory || [];
    appendHistory(
      existing,
      existing.orderStatus,
      `Courier Guy booked: ${existing.delivery?.waybill || existing.tracking?.trackingNumber}`,
      actorUserId
    );
    await existing.save();
  } else {
    throw new HttpError(
      "Provide courier + trackingNumber for manual dispatch, or omit them to book The Courier Guy automatically.",
      400
    );
  }

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
 * Admin marks a pickup order ready for customer collection.
 */
const readyForPickup = async (id, { note = "" } = {}, { actorUserId }) => {
  const order = await Order.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!order) throw new HttpError("Order not found", 404);
  await require("./replacementService").assertReplacementFulfillmentAllowed(order);
  if (order.fulfillmentMethod !== "PICKUP") {
    throw new HttpError("Only pickup orders can be marked ready for pickup", 400);
  }

  if (order.orderStatus === "PLACED") {
    await updateStatus(
      id,
      {
        status: "PROCESSING",
        note: note || "Preparing for pickup",
        skipNotify: true,
      },
      { actorUserId }
    );
  }

  const orderForCode = await Order.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!orderForCode) throw new HttpError("Order not found", 404);
  await ensurePickupCollectionCode(orderForCode);

  const updated = await updateStatus(
    id,
    {
      status: "READY_FOR_PICKUP",
      note: note || "Order is ready for collection",
    },
    { actorUserId }
  );

  orderEmailService
    .sendReadyForPickup(updated)
    .catch((err) =>
      console.error("[orderService] sendReadyForPickup failed:", err?.message || err)
    );

  return updated;
};

/**
 * Admin marks a pickup order as packed (optional step before ready-for-pickup).
 */
const markPacked = async (id, { note = "" } = {}, { actorUserId }) => {
  const order = await Order.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!order) throw new HttpError("Order not found", 404);
  await require("./replacementService").assertReplacementFulfillmentAllowed(order);
  if (order.fulfillmentMethod !== "PICKUP") {
    throw new HttpError("Only pickup orders can be marked packed", 400);
  }

  if (order.orderStatus === "PLACED") {
    await updateStatus(
      id,
      {
        status: "PROCESSING",
        note: note || "Preparing for pickup",
        skipNotify: true,
      },
      { actorUserId }
    );
  }

  return updateStatus(
    id,
    { status: "PACKED", note: note || "Order packed for pickup" },
    { actorUserId }
  );
};

/**
 * Admin verifies pickup PIN at the counter → COLLECTED (user confirms → FULFILLED).
 */
const verifyPickup = async (id, { pin = "" } = {}, { actorUserId }) => {
  let order = await Order.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!order) throw new HttpError("Order not found", 404);
  if (order.fulfillmentMethod !== "PICKUP") {
    throw new HttpError("Only pickup orders can be verified at the counter", 400);
  }
  if (order.paymentStatus !== "PAID") {
    throw new HttpError("Order must be paid before completing pickup", 400);
  }

  const allowedVerifyStatuses = new Set([
    "PLACED",
    "PROCESSING",
    "PACKED",
    "READY_FOR_PICKUP",
  ]);
  if (!allowedVerifyStatuses.has(order.orderStatus)) {
    throw new HttpError(
      `Cannot complete pickup while order is ${order.orderStatus}`,
      400
    );
  }
  if (order.pickupCredentials?.collectedAt) {
    throw new HttpError("This order has already been collected", 409);
  }

  await pickupCredentialService.issuePickupCredentials(order);
  order = await Order.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!order) throw new HttpError("Order not found", 404);

  if (order.orderStatus !== "READY_FOR_PICKUP") {
    if (order.orderStatus === "PLACED") {
      await updateStatus(
        id,
        { status: "PROCESSING", note: "Preparing for pickup", skipNotify: true },
        { actorUserId }
      );
    }
    await readyForPickup(
      id,
      { note: "Marked ready for pickup verification" },
      { actorUserId }
    );
    order = await Order.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!order) throw new HttpError("Order not found", 404);
  }

  if (!pickupCredentialService.pinMatchesOrder(order, pin)) {
    throw new HttpError("Invalid pickup PIN", 403);
  }

  const collectedAt = new Date();
  const resolvedPin = String(
    order.pickupCollection?.code || order.pickupCredentials?.pin || ""
  ).trim();

  order.pickupCredentials = {
    pin: resolvedPin,
    qrToken: order.pickupCredentials?.qrToken || "",
    issuedAt:
      order.pickupCredentials?.issuedAt ||
      order.pickupCollection?.generatedAt ||
      collectedAt,
    collectedAt,
    collectedBy: actorUserId || null,
  };
  await order.save();

  return updateStatus(
    id,
    {
      status: "COLLECTED",
      note: "Admin verified pickup PIN — awaiting customer confirmation",
    },
    { actorUserId }
  );
};

/**
 * Admin: refresh Courier Guy tracking + proof-of-delivery status for a delivery order.
 */
const syncDeliveryPod = async (id, { actorUserId } = {}) => {
  const order = await Order.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!order) throw new HttpError("Order not found", 404);
  if (order.fulfillmentMethod === "PICKUP") {
    throw new HttpError("Pickup orders do not have courier POD status", 400);
  }
  if (!order.delivery?.shipmentId && !order.delivery?.waybill) {
    throw new HttpError(
      "Order has no Courier Guy shipment yet. Dispatch the order first.",
      400
    );
  }

  const result = await shippingPodService.syncDeliveryPodForOrder(order, {
    fetchAssets: true,
  });
  await order.save();

  if (result.nextOrderStatus && result.nextOrderStatus !== order.orderStatus) {
    return updateStatus(
      order._id,
      {
        status: result.nextOrderStatus,
        note: `Courier POD sync: ${order.delivery?.status || result.podStatus || "updated"}`,
      },
      { actorUserId }
    );
  }

  return Order.findOne({ _id: id, isDeleted: { $ne: true } });
};

/**
 * Customer confirms receipt after DELIVERED (delivery) or COLLECTED (pickup).
 * If `satisfied === true` the order moves to terminal FULFILLED.
 */
const confirmDelivery = async (
  id,
  userId,
  { satisfied, feedback = "", collectionCode = "" } = {}
) => {
  if (typeof satisfied !== "boolean") {
    throw new HttpError("`satisfied` must be a boolean", 400);
  }
  const order = await Order.findOne({
    _id: id,
    user: userId,
    isDeleted: { $ne: true },
  });
  if (!order) throw new HttpError("Order not found", 404);

  const isPickupCollected =
    order.fulfillmentMethod === "PICKUP" && order.orderStatus === "COLLECTED";
  const isDelivered = order.orderStatus === "DELIVERED";

  if (!isPickupCollected && !isDelivered) {
    if (order.fulfillmentMethod === "PICKUP" && order.orderStatus === "READY_FOR_PICKUP") {
      throw new HttpError(
        "Your order has not been marked as picked up yet. Please collect it at the warehouse first.",
        400
      );
    }
    throw new HttpError(
      `Cannot confirm order while status is ${order.orderStatus}`,
      400
    );
  }
  if (order.orderStatus === "FULFILLED" && order.fulfillment?.satisfied === true) {
    return order;
  }

  // Legacy: ignore collectionCode for pickup — admin already verified PIN at counter.
  void collectionCode;

  order.fulfillment = {
    satisfied,
    ratedAt: new Date(),
    feedback: feedback ? String(feedback).slice(0, 2000) : "",
  };
  if (satisfied) {
    order.orderStatus = "FULFILLED";
    appendHistory(
      order,
      "FULFILLED",
      isPickupCollected ? "Customer confirmed pickup" : "Customer confirmed receipt",
      userId
    );
  } else {
    appendHistory(
      order,
      order.orderStatus,
      isPickupCollected
        ? "Customer reported a problem after pickup"
        : "Customer reported a problem with the delivery",
      userId
    );
  }
  await order.save();

  if (satisfied) {
    notifyCustomerOrderStatus(order._id, {
      newStatus: "FULFILLED",
      note: isPickupCollected
        ? "Customer confirmed pickup"
        : "Customer confirmed receipt",
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
 * Resolve PayFast pf_payment_id from order or linked Payment record.
 */
const resolvePayfastPaymentId = async (order) => {
  const fromOrder = order?.transactionId ? String(order.transactionId).trim() : "";
  if (fromOrder) return fromOrder;

  const payment = await Payment.findOne({
    order: order._id,
    gateway: "PAYFAST",
    status: "SUCCESS",
    isDeleted: { $ne: true },
  })
    .select("paymentId transactionId response")
    .lean();

  const fromPayment =
    (payment?.paymentId ? String(payment.paymentId).trim() : "") ||
    (payment?.transactionId ? String(payment.transactionId).trim() : "");

  if (fromPayment) return fromPayment;

  const itn = payment?.response?.itn;
  if (itn && typeof itn === "object" && itn.pf_payment_id != null) {
    const fromItn = String(itn.pf_payment_id).trim();
    if (fromItn) return fromItn;
  }

  return null;
};

/**
 * Attempt a gateway refund for a paid order.
 * PayFast uses the REST Refunds API (live); sandbox falls back to manual portal refund.
 */
const attemptGatewayRefund = async (
  order,
  { reason = "", refundAudit = null, amountInMajor = null } = {}
) => {
  const paymentMethod = String(order.paymentMethod || "PAYFAST").toUpperCase();
  const refundAmount =
    amountInMajor != null
      ? Math.round(Number(amountInMajor) * 100) / 100
      : Math.round(Number(order.totalAmount) * 100) / 100;

  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    if (refundAudit) mergeRefundAudit(order, refundAudit);
    return {
      outcome: "FAILED",
      error: "Refund amount must be greater than zero.",
      apiAttempted: false,
    };
  }
  if (refundAmount > Number(order.totalAmount) + 0.01) {
    if (refundAudit) mergeRefundAudit(order, refundAudit);
    return {
      outcome: "FAILED",
      error: "Refund amount cannot exceed the order total.",
      apiAttempted: false,
    };
  }

  if (paymentMethod === "PAYFAST") {
    const pfConfig = payfastService.readConfig();

    const pfPaymentId = await resolvePayfastPaymentId(order);
    if (!pfPaymentId) {
      if (refundAudit) mergeRefundAudit(order, refundAudit);
      return {
        outcome: "FAILED",
        error:
          "Order has no PayFast transaction id (pf_payment_id). Cannot auto-refund via API.",
        apiAttempted: false,
      };
    }

    const refundReason = reason
      ? String(reason).slice(0, 255)
      : "Admin-initiated refund";

    try {
      await payfastService.queryRefund(pfPaymentId).catch((err) => {
        console.warn(
          "[orderService] PayFast refund query failed (continuing):",
          err?.message || err
        );
      });

      const refundData = await payfastService.createRefund(pfPaymentId, {
        amountInMajor: refundAmount,
        reason: refundReason,
        notifyBuyer: true,
        notifyMerchant: false,
      });

      const parsed = payfastService.parseCreateRefundResponse(refundData);
      if (!parsed.apiSuccess) {
        throw new HttpError(
          parsed.failureReason || "PayFast rejected the refund request.",
          502
        );
      }

      const isTerminalSuccess = parsed.terminalSuccess;

      order.refund = {
        ...(order.refund || {}),
        status: isTerminalSuccess ? "PROCESSED" : "PENDING",
        paystackRefundId: parsed.refundId || "",
        amount: refundAmount,
        currency: order.currency,
        attemptedAt: new Date(),
        processedAt: isTerminalSuccess ? new Date() : null,
        lastError: "",
        manualNote: "",
      };
      if (refundAudit) mergeRefundAudit(order, refundAudit);
      return {
        outcome: isTerminalSuccess ? "REFUNDED" : "PENDING",
        manual: false,
        apiAttempted: true,
        payfastEnvironment: pfConfig.sandbox ? "sandbox" : "live",
        payfastRefundStatus: parsed.refundStatus,
      };
    } catch (err) {
      const message = err?.message || String(err);
      console.error(
        "[orderService] PayFast createRefund failed:",
        message,
        pfConfig.sandbox ? "(sandbox)" : "(live)"
      );

      if (pfConfig.sandbox) {
        order.refund = {
          ...(order.refund || {}),
          status: "PENDING",
          paystackRefundId: "",
          amount: refundAmount,
          currency: order.currency,
          attemptedAt: new Date(),
          processedAt: null,
          lastError: message.slice(0, 500),
          manualNote:
            "PayFast sandbox REST refund failed or is unavailable. Complete the refund in the PayFast sandbox merchant portal, then mark the order REFUNDED.",
        };
        if (refundAudit) mergeRefundAudit(order, refundAudit);
        return {
          outcome: "PENDING",
          manual: true,
          apiAttempted: true,
          error: message,
          payfastEnvironment: "sandbox",
        };
      }

      order.refund = {
        ...(order.refund || {}),
        status: "FAILED",
        attemptedAt: new Date(),
        lastError: message.slice(0, 500),
        manualNote:
          "PayFast API refund failed. Complete manually in the PayFast merchant portal if needed.",
      };
      if (refundAudit) mergeRefundAudit(order, refundAudit);
      return { outcome: "FAILED", error: message, apiAttempted: true };
    }
  }

  if (!order.paystackReference) {
    if (refundAudit) mergeRefundAudit(order, refundAudit);
    return {
      outcome: "FAILED",
      error:
        "Order has no payment reference; cannot auto-refund. Settle manually in the gateway.",
    };
  }
  try {
    const refundData = await paystackService.refundTransaction({
      reference: order.paystackReference,
      amountInMajor: refundAmount,
      currency: order.currency,
      merchantNote: reason ? String(reason).slice(0, 300) : "Admin refund",
    });

    const paystackStatus = String(refundData?.status || "").toLowerCase();
    const isTerminalSuccess = paystackStatus === "processed";

    order.refund = {
      ...(order.refund || {}),
      status: isTerminalSuccess ? "PROCESSED" : "PENDING",
      paystackRefundId: refundData?.id != null ? String(refundData.id) : "",
      amount: refundAmount,
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

/** @deprecated use attemptGatewayRefund */
const attemptPaystackRefund = attemptGatewayRefund;

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
    if (!["PLACED", "PROCESSING", "PACKED"].includes(preCheck.orderStatus)) {
      throw new HttpError(
        `You can only cancel before the order is ready for pickup (current status: ${preCheck.orderStatus}).`,
        400
      );
    }
  } else if (
    [
      "READY_FOR_PICKUP",
      "COLLECTED",
      "SHIPPED",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "FULFILLED",
      "CANCELLED",
    ].includes(preCheck.orderStatus)
  ) {
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
      paymentMethod: preCheck.paymentMethod,
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
        if (!["PLACED", "PROCESSING", "PACKED"].includes(order.orderStatus)) {
          throw new HttpError(
            `You can only cancel before the order is ready for pickup (current status: ${order.orderStatus}).`,
            400
          );
        }
      } else if (
        [
          "READY_FOR_PICKUP",
          "COLLECTED",
          "SHIPPED",
          "OUT_FOR_DELIVERY",
          "DELIVERED",
          "FULFILLED",
          "CANCELLED",
        ].includes(order.orderStatus)
      ) {
        throw new HttpError(
          `Order is ${order.orderStatus}; cancel is no longer possible.`,
          400
        );
      }

      if (order.delivery?.shipmentId || order.delivery?.waybill) {
        await shippingShipmentService.cancelShipmentForOrder(order);
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
        ? `${baseNote} | Replacement shipment cancelled — no separate charge to refund`
        : baseNote;
      const noteWithRefund = wasPaid
        ? refundOutcome.outcome === "REFUNDED"
          ? `${replacementNote} | Refund processed (${order.refund.paystackRefundId || "gateway"})`
          : refundOutcome.outcome === "PENDING"
            ? refundOutcome.manual
              ? `${replacementNote} | PayFast refund initiated — complete in merchant portal`
              : `${replacementNote} | Refund initiated, awaiting confirmation`
            : `${replacementNote} | Refund FAILED: ${refundError || "unknown"} — settle manually`
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
  { reason = "", adminNote = "", amountInMajor = null } = {},
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
  const refundNote = parts.length
    ? `Admin refund — ${parts.join(" — ")}`.slice(0, 300)
    : "Admin-initiated refund";

  const refundOutcome = await attemptGatewayRefund(order, {
    reason: refundNote,
    refundAudit: {
      reason: trimmedReason,
      adminNote: trimmedAdminNote,
      refundedBy,
    },
    amountInMajor,
  });

  const requestedAmount =
    amountInMajor != null
      ? Math.round(Number(amountInMajor) * 100) / 100
      : Math.round(Number(order.totalAmount) * 100) / 100;
  const isFullRefund = requestedAmount >= Number(order.totalAmount) - 0.01;

  if (refundOutcome.outcome === "REFUNDED") {
    order.paymentStatus = isFullRefund ? "REFUNDED" : "PAID";
  } else if (refundOutcome.outcome === "PENDING") {
    order.paymentStatus = "REFUND_INITIATED";
  } else {
    order.paymentStatus = "REFUND_FAILED";
  }

  const refundNoteBase =
    refundOutcome.outcome === "REFUNDED"
      ? `Admin PayFast refund processed (${order.refund?.paystackRefundId || "gateway"})`
      : refundOutcome.outcome === "PENDING"
        ? refundOutcome.manual
          ? "Admin refund initiated — complete in PayFast merchant portal (sandbox)"
          : "Admin PayFast refund initiated, awaiting gateway confirmation"
        : `Admin refund FAILED: ${refundOutcome.error || "unknown"} — settle manually`;

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
      manual: refundOutcome.manual || false,
      apiAttempted: refundOutcome.apiAttempted ?? false,
      payfastEnvironment: refundOutcome.payfastEnvironment || null,
      error: refundOutcome.error || null,
      manualNote: order.refund?.manualNote || "",
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

/**
 * Admin: fetch a signed ShipLogic shipping label URL for a dispatched delivery order.
 */
const getShippingLabelUrl = async (id) => {
  const order = await Order.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!order) throw new HttpError("Order not found", 404);
  if (order.fulfillmentMethod === "PICKUP") {
    throw new HttpError("Pickup orders do not have courier shipping labels", 400);
  }

  const result = await shippingShipmentService.getShippingLabelUrlForOrder(order);
  await order.save();
  return result;
};

/**
 * Admin: stream shipping label PDF (or redirect to signed URL).
 */
const getShippingLabelStream = async (id) => {
  const order = await Order.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!order) throw new HttpError("Order not found", 404);
  if (order.fulfillmentMethod === "PICKUP") {
    throw new HttpError("Pickup orders do not have courier shipping labels", 400);
  }

  const asset = await shippingShipmentService.getShippingLabelAssetForOrder(order, {
    rebookIfMissing: true,
  });
  await order.save();
  return asset;
};

const rebookCourierShipment = async (id, { actorUserId } = {}) => {
  const order = await Order.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!order) throw new HttpError("Order not found", 404);
  if (order.fulfillmentMethod === "PICKUP") {
    throw new HttpError("Pickup orders do not use courier shipments", 400);
  }
  await shippingShipmentService.rebookCourierShipmentForOrder(order, { actorUserId });
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
  readyForPickup,
  markPacked,
  verifyPickup,
  syncDeliveryPod,
  getShippingLabelUrl,
  getShippingLabelStream,
  rebookCourierShipment,
  confirmDelivery,
  adminCancelOrder,
  adminInitiateRefund,
  attemptGatewayRefund,
  attemptPaystackRefund,
  _internal: {
    nextOrderNumber,
    buildOrderPayload,
    normalizeShippingAddress,
    restockOrderItems,
    applyStockDeductionForOrder,
  },
};
