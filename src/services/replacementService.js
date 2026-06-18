const mongoose = require("mongoose");
const ReplacementRequest = require("../models/ReplacementRequest");
const Order = require("../models/Order");
const User = require("../models/User");
const Counter = require("../models/Counter");
const HttpError = require("../utils/httpError");
const orderService = require("./orderService");
const orderEmailService = require("./orderEmailService");
const fcmReplacementNotifyService = require("./fcmReplacementNotifyService");
const adminNotificationService = require("./adminNotificationService");

const notDeleted = { isDeleted: { $ne: true } };

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildReplacementSearchFilter = async (searchTerm) => {
  const trimmed = String(searchTerm || "").trim();
  if (!trimmed) return null;

  const safe = escapeRegex(trimmed);
  const orClauses = [{ requestNumber: { $regex: safe, $options: "i" } }];

  if (/^[a-f0-9]{24}$/i.test(trimmed)) {
    orClauses.push({ _id: trimmed });
  }

  const orderOrClauses = [{ orderNumber: { $regex: safe, $options: "i" } }];
  if (/^[a-f0-9]{24}$/i.test(trimmed)) {
    orderOrClauses.push({ _id: trimmed });
  }

  const [matchingUsers, matchingOrders] = await Promise.all([
    User.find({
      $or: [
        { fullName: { $regex: safe, $options: "i" } },
        { email: { $regex: safe, $options: "i" } },
      ],
    })
      .select("_id")
      .lean(),
    Order.find({
      isDeleted: { $ne: true },
      $or: orderOrClauses,
    })
      .select("_id")
      .lean(),
  ]);

  if (matchingUsers.length) {
    orClauses.push({ user: { $in: matchingUsers.map((u) => u._id) } });
  }

  const orderIds = matchingOrders.map((o) => o._id);
  if (orderIds.length) {
    orClauses.push({ order: { $in: orderIds } }, { replacementOrder: { $in: orderIds } });
  }

  return { $or: orClauses };
};

/** ReplacementRequest rows that block opening another request for the same order. */
const BLOCKING_REPLACEMENT_REQUEST_STATUSES = [
  "REQUESTED",
  "PENDING", // legacy
  "APPROVED",
  "PROCESSING",
  "SHIPPED",
];

const APPROVE_OR_REJECTABLE_STATUSES = new Set(["REQUESTED", "PENDING"]);

const orderPopulateSummary =
  "orderNumber orderStatus paymentStatus totalAmount currency orderType replacementState latestReplacementRequest latestReplacementOrder replacementCount parentOrderNumber";

const nextReplacementRequestNumber = async (session) => {
  const doc = await Counter.findOneAndUpdate(
    { _id: "replacementRequestSequence" },
    [{ $set: { seq: { $add: [{ $ifNull: ["$seq", 10000] }, 1] } } }],
    { returnDocument: "after", upsert: true, session, updatePipeline: true }
  );
  return `REP-${doc.seq}`;
};

const generateReplacementOrderNumber = async (originalOrder, session) => {
  const base = String(originalOrder.orderNumber);
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const siblings = await Order.find({
    replacementFor: originalOrder._id,
    orderType: "REPLACEMENT",
    ...notDeleted,
  })
    .select("orderNumber")
    .session(session)
    .lean();
  const re = new RegExp(`^${escaped}-R(\\d+)$`);
  let max = 0;
  for (const s of siblings) {
    const m = String(s.orderNumber).match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${base}-R${max + 1}`;
};

const ensureOwnedDeliveredPaidOriginal = async (orderId, userId) => {
  const order = await Order.findOne({ _id: orderId, user: userId, ...notDeleted });
  if (!order) throw new HttpError("Order not found", 404);
  if (order.orderType === "REPLACEMENT") {
    throw new HttpError("You cannot request a replacement for a replacement order.", 400);
  }
  if (order.orderStatus === "CANCELLED") {
    throw new HttpError("Cannot request replacement for a cancelled order.", 400);
  }
  if (order.orderStatus !== "DELIVERED" && order.orderStatus !== "FULFILLED") {
    throw new HttpError(
      `Replacements are only allowed after delivery (current status: ${order.orderStatus}).`,
      400
    );
  }
  if (order.paymentStatus !== "PAID") {
    throw new HttpError("Only paid orders can request a replacement.", 400);
  }
  return order;
};

const assertNoBlockingReplacement = async (orderId) => {
  const pendingReq = await ReplacementRequest.findOne({
    order: orderId,
    status: { $in: BLOCKING_REPLACEMENT_REQUEST_STATUSES },
    ...notDeleted,
  });
  if (pendingReq) {
    throw new HttpError(
      `You already have an open replacement request (${pendingReq.requestNumber}).`,
      409
    );
  }
  const activeChild = await Order.findOne({
    replacementFor: orderId,
    orderType: "REPLACEMENT",
    orderStatus: { $nin: ["DELIVERED", "FULFILLED", "CANCELLED"] },
    ...notDeleted,
  })
    .select("orderNumber")
    .lean();
  if (activeChild) {
    throw new HttpError(
      `A replacement shipment is already in progress (${activeChild.orderNumber}).`,
      409
    );
  }
};

const createRequest = async (userId, { orderId, reason = "", images = [] } = {}) => {
  const order = await ensureOwnedDeliveredPaidOriginal(orderId, userId);
  await assertNoBlockingReplacement(order._id);

  const session = await mongoose.startSession();
  let request;
  try {
    await session.withTransaction(async () => {
      const requestNumber = await nextReplacementRequestNumber(session);
      [request] = await ReplacementRequest.create(
        [
          {
            requestNumber,
            user: userId,
            order: order._id,
            reason: String(reason || "").trim().slice(0, 2000),
            images: Array.isArray(images) ? images.filter(Boolean).slice(0, 12) : [],
          },
        ],
        { session }
      );
      await Order.updateOne(
        { _id: order._id, isDeleted: { $ne: true } },
        {
          $set: {
            replacementState: "REQUESTED",
            latestReplacementRequest: request._id,
          },
        }
      ).session(session);
    });
  } finally {
    await session.endSession();
  }

  const populated = await ReplacementRequest.findById(request._id).populate(
    "order",
    orderPopulateSummary
  );

  orderEmailService.sendReplacementRequestSubmitted(populated).catch((err) =>
    console.error("[replacementService] sendReplacementRequestSubmitted:", err?.message || err)
  );
  orderEmailService.sendReplacementNewRequestAdminAlert(populated).catch((err) =>
    console.error("[replacementService] sendReplacementNewRequestAdminAlert:", err?.message || err)
  );
  fcmReplacementNotifyService.notifyUserReplacementSubmitted(userId, populated).catch(() => {});
  adminNotificationService.notifyReplacementRequest(populated).catch(() => {});

  return populated;
};

const listMyRequests = async (userId, q = {}) => {
  const page = Number(q.page) || 1;
  const limit = Math.min(Number(q.limit) || 20, 100);
  const skip = (page - 1) * limit;
  const filter = { user: userId, ...notDeleted };
  if (q.status) filter.status = q.status;

  const [items, total] = await Promise.all([
    ReplacementRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("order", orderPopulateSummary)
      .populate(
        "replacementOrder",
        "orderNumber orderStatus paymentStatus orderType replacementFor parentOrderNumber"
      ),
    ReplacementRequest.countDocuments(filter),
  ]);

  return {
    requests: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

const getRequestById = async (requestId, userId) => {
  const request = await ReplacementRequest.findOne({
    _id: requestId,
    user: userId,
    ...notDeleted,
  })
    .populate("order")
    .populate("replacementOrder");
  if (!request) throw new HttpError("Request not found", 404);
  return request;
};

const listAllForAdmin = async (q = {}) => {
  const page = Number(q.page) || 1;
  const limit = Math.min(Number(q.limit) || 20, 100);
  const skip = (page - 1) * limit;
  const filter = { ...notDeleted };
  if (q.status) filter.status = q.status;
  if (q.search) {
    const searchFilter = await buildReplacementSearchFilter(q.search);
    if (searchFilter) Object.assign(filter, searchFilter);
  }

  const [items, total] = await Promise.all([
    ReplacementRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "fullName email phone role")
      .populate("order", orderPopulateSummary)
      .populate(
        "replacementOrder",
        "orderNumber orderStatus paymentStatus orderType replacementFor parentOrderNumber"
      ),
    ReplacementRequest.countDocuments(filter),
  ]);

  return {
    requests: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

const getRequestByIdAdmin = async (requestId) => {
  const request = await ReplacementRequest.findOne({ _id: requestId, ...notDeleted })
    .populate("user", "fullName email phone role")
    .populate("order")
    .populate("replacementOrder");
  if (!request) throw new HttpError("Request not found", 404);
  return request;
};

const approveRequest = async (requestId, { adminRemarks = "" } = {}, { actorUserId }) => {
  const request = await ReplacementRequest.findOne({ _id: requestId, ...notDeleted });
  if (!request) throw new HttpError("Request not found", 404);
  if (!APPROVE_OR_REJECTABLE_STATUSES.has(request.status)) {
    throw new HttpError(`Request is already ${request.status}.`, 400);
  }

  const applyStock = orderService._internal.applyStockDeductionForOrder;
  if (typeof applyStock !== "function") {
    throw new HttpError("Order service misconfigured (applyStockDeductionForOrder missing)", 500);
  }

  const session = await mongoose.startSession();
  let replacementOrder;
  try {
    await session.withTransaction(async () => {
      const lockedReq = await ReplacementRequest.findById(requestId).session(session);
      if (!lockedReq || !APPROVE_OR_REJECTABLE_STATUSES.has(lockedReq.status)) {
        throw new HttpError("Request is no longer awaiting review", 409);
      }

      const original = await Order.findById(lockedReq.order).session(session);
      if (!original || original.isDeleted) throw new HttpError("Original order not found", 404);
      if (original.orderType === "REPLACEMENT") {
        throw new HttpError("Invalid original order", 400);
      }
      if (original.paymentStatus !== "PAID") {
        throw new HttpError("Original order is not paid; cannot spawn replacement.", 400);
      }
      if (!["DELIVERED", "FULFILLED"].includes(original.orderStatus)) {
        throw new HttpError(
          `Original order must be delivered (current: ${original.orderStatus}).`,
          400
        );
      }

      const activeChild = await Order.findOne({
        replacementFor: original._id,
        orderType: "REPLACEMENT",
        orderStatus: { $nin: ["DELIVERED", "FULFILLED", "CANCELLED"] },
        isDeleted: { $ne: true },
      }).session(session);
      if (activeChild) {
        throw new HttpError(
          `Another replacement is already in progress (${activeChild.orderNumber}).`,
          409
        );
      }

      const orderNumber = await generateReplacementOrderNumber(original, session);
      const items = original.items.map((line) => ({
        product: line.product,
        title: line.title,
        imageUrl: line.imageUrl,
        quantity: line.quantity,
        price: line.price,
        lineTotal: line.lineTotal,
      }));

      const origPayRef = original.paystackReference || "";
      const origTx = original.transactionId || "";

      [replacementOrder] = await Order.create(
        [
          {
            orderNumber,
            user: original.user,
            orderType: "REPLACEMENT",
            replacementFor: original._id,
            parentOrderNumber: original.orderNumber || "",
            replacementReason: lockedReq.reason || "",
            items,
            totalAmount: original.totalAmount,
            currency: original.currency,
            paymentStatus: "PAID",
            orderStatus: "PROCESSING",
            paymentMethod: original.paymentMethod || "PAYSTACK",
            shippingAddress: original.shippingAddress,
            inventoryReserved: true,
            paystackReference: origPayRef,
            transactionId: origTx,
            originalPaystackReference: origPayRef,
            originalTransactionId: origTx,
            orderStatusHistory: [
              {
                status: "PLACED",
                at: new Date(),
                note: `Replacement for ${original.orderNumber} (request ${lockedReq.requestNumber})`,
              },
              {
                status: "PROCESSING",
                at: new Date(),
                note: "Replacement order — processing (no new payment)",
              },
            ],
          },
        ],
        { session }
      );

      await applyStock(replacementOrder, session);

      lockedReq.status = "APPROVED";
      lockedReq.adminRemarks = adminRemarks ? String(adminRemarks).trim().slice(0, 2000) : "";
      lockedReq.replacementOrder = replacementOrder._id;
      lockedReq.resolvedBy = actorUserId || null;
      lockedReq.resolvedAt = new Date();
      await lockedReq.save({ session });

      await Order.updateOne(
        { _id: original._id, isDeleted: { $ne: true } },
        {
          $set: {
            replacementState: "IN_PROGRESS",
            latestReplacementOrder: replacementOrder._id,
          },
          $inc: { replacementCount: 1 },
        }
      ).session(session);
    });
  } finally {
    await session.endSession();
  }

  const out = await ReplacementRequest.findById(requestId)
    .populate("order", orderPopulateSummary)
    .populate(
      "replacementOrder",
      "orderNumber orderStatus paymentStatus totalAmount currency orderType replacementFor parentOrderNumber originalPaystackReference originalTransactionId"
    );

  orderEmailService.sendReplacementApproved(out).catch((err) =>
    console.error("[replacementService] sendReplacementApproved:", err?.message || err)
  );
  fcmReplacementNotifyService
    .notifyUserReplacementApproved(String(out.user?._id || out.user), out)
    .catch((err) =>
      console.error("[replacementService] notifyUserReplacementApproved:", err?.message || err)
    );

  return out;
};

const rejectRequest = async (requestId, { adminRemarks = "" } = {}, { actorUserId }) => {
  const request = await ReplacementRequest.findOne({ _id: requestId, ...notDeleted });
  if (!request) throw new HttpError("Request not found", 404);
  if (!APPROVE_OR_REJECTABLE_STATUSES.has(request.status)) {
    throw new HttpError(`Request is already ${request.status}.`, 400);
  }

  request.status = "REJECTED";
  request.adminRemarks = adminRemarks ? String(adminRemarks).trim().slice(0, 2000) : "";
  request.resolvedBy = actorUserId || null;
  request.resolvedAt = new Date();
  request.rejectedAt = new Date();
  await request.save();

  await Order.updateOne(
    { _id: request.order, isDeleted: { $ne: true } },
    { $set: { replacementState: "REJECTED" } }
  ).catch((err) =>
    console.warn("[replacementService] original order replacementState (reject) update:", err?.message || err)
  );

  const populated = await ReplacementRequest.findById(request._id)
    .populate("order", orderPopulateSummary)
    .populate("user", "fullName email");

  orderEmailService.sendReplacementRejected(populated).catch((err) =>
    console.error("[replacementService] sendReplacementRejected:", err?.message || err)
  );
  fcmReplacementNotifyService
    .notifyUserReplacementRejected(String(populated.user?._id || populated.user), populated)
    .catch(() => {});

  return populated;
};

module.exports = {
  createRequest,
  listMyRequests,
  getRequestById,
  listAllForAdmin,
  getRequestByIdAdmin,
  approveRequest,
  rejectRequest,
  _internal: { nextReplacementRequestNumber, generateReplacementOrderNumber },
};
