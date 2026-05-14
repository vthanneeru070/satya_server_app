const mongoose = require("mongoose");
const ReplacementRequest = require("../models/ReplacementRequest");
const Order = require("../models/Order");
const Counter = require("../models/Counter");
const HttpError = require("../utils/httpError");
const orderService = require("./orderService");
const orderEmailService = require("./orderEmailService");
const fcmReplacementNotifyService = require("./fcmReplacementNotifyService");

const notDeleted = { isDeleted: { $ne: true } };

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
    status: "PENDING",
    ...notDeleted,
  });
  if (pendingReq) {
    throw new HttpError(
      `You already have a pending replacement request (${pendingReq.requestNumber}).`,
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
            status: "PENDING",
          },
        ],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  const populated = await ReplacementRequest.findById(request._id).populate(
    "order",
    "orderNumber orderStatus paymentStatus totalAmount currency orderType"
  );

  orderEmailService.sendReplacementRequestSubmitted(populated).catch((err) =>
    console.error("[replacementService] sendReplacementRequestSubmitted:", err?.message || err)
  );
  orderEmailService.sendReplacementNewRequestAdminAlert(populated).catch((err) =>
    console.error("[replacementService] sendReplacementNewRequestAdminAlert:", err?.message || err)
  );
  fcmReplacementNotifyService.notifyUserReplacementSubmitted(userId, populated).catch(() => {});
  fcmReplacementNotifyService.notifyAdminsNewReplacementRequest(populated).catch(() => {});

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
      .populate("order", "orderNumber orderStatus paymentStatus totalAmount currency orderType")
      .populate("replacementOrder", "orderNumber orderStatus paymentStatus orderType"),
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

  const [items, total] = await Promise.all([
    ReplacementRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "fullName email phone role")
      .populate("order", "orderNumber orderStatus paymentStatus totalAmount currency orderType")
      .populate("replacementOrder", "orderNumber orderStatus paymentStatus orderType"),
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
  if (request.status !== "PENDING") {
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
      if (!lockedReq || lockedReq.status !== "PENDING") {
        throw new HttpError("Request is no longer pending", 409);
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

      [replacementOrder] = await Order.create(
        [
          {
            orderNumber,
            user: original.user,
            orderType: "REPLACEMENT",
            replacementFor: original._id,
            replacementReason: lockedReq.reason || "",
            replacementStatus: "APPROVED",
            items,
            totalAmount: original.totalAmount,
            currency: original.currency,
            paymentStatus: "PAID",
            orderStatus: "PROCESSING",
            paymentMethod: original.paymentMethod || "PAYSTACK",
            shippingAddress: original.shippingAddress,
            inventoryReserved: true,
            paystackReference: original.paystackReference || "",
            transactionId: original.transactionId || "",
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
    });
  } finally {
    await session.endSession();
  }

  const out = await ReplacementRequest.findById(requestId)
    .populate("order", "orderNumber orderStatus paymentStatus totalAmount currency orderType")
    .populate(
      "replacementOrder",
      "orderNumber orderStatus paymentStatus totalAmount currency orderType replacementFor"
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
  if (request.status !== "PENDING") {
    throw new HttpError(`Request is already ${request.status}.`, 400);
  }

  request.status = "REJECTED";
  request.adminRemarks = adminRemarks ? String(adminRemarks).trim().slice(0, 2000) : "";
  request.resolvedBy = actorUserId || null;
  request.resolvedAt = new Date();
  await request.save();

  const populated = await ReplacementRequest.findById(request._id)
    .populate("order", "orderNumber orderStatus paymentStatus totalAmount currency")
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
