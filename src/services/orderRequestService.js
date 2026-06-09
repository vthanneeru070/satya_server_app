const mongoose = require("mongoose");
const OrderRequest = require("../models/OrderRequest");
const Order = require("../models/Order");
const Counter = require("../models/Counter");
const HttpError = require("../utils/httpError");
const orderService = require("./orderService");
const orderEmailService = require("./orderEmailService");
const adminNotificationService = require("./adminNotificationService");

const REQUEST_PREFIX = process.env.REQUEST_NUMBER_PREFIX || "REQ";

const nextRequestNumber = async (session) => {
  const doc = await Counter.findOneAndUpdate(
    { _id: "requestSequence" },
    [{ $set: { seq: { $add: [{ $ifNull: ["$seq", 10000] }, 1] } } }],
    { returnDocument: "after", upsert: true, session, updatePipeline: true }
  );
  return `${REQUEST_PREFIX}-${doc.seq}`;
};

const ensureOwnedOrder = async (orderId, userId) => {
  const order = await Order.findOne({
    _id: orderId,
    user: userId,
    isDeleted: { $ne: true },
  });
  if (!order) throw new HttpError("Order not found", 404);
  return order;
};

const ensureNoOpenRequest = async (orderId, type) => {
  const exists = await OrderRequest.findOne({
    order: orderId,
    type,
    status: { $in: ["PENDING", "APPROVED"] },
    isDeleted: { $ne: true },
  });
  if (exists) {
    throw new HttpError(
      `You already have an open ${type.toLowerCase()} request (${exists.requestNumber}) for this order.`,
      409
    );
  }
};

const assertCanCreate = (order, type) => {
  if (type === "CANCELLATION") {
    if (["PLACED", "PROCESSING"].includes(order.orderStatus)) {
      throw new HttpError(
        "Cancel this order immediately with POST /api/v1/orders/{orderId}/cancel (refund starts automatically if already paid).",
        400
      );
    }
    if (["SHIPPED", "DELIVERED", "FULFILLED", "CANCELLED"].includes(order.orderStatus)) {
      throw new HttpError(
        `Order is ${order.orderStatus}; it has already been dispatched and can no longer be cancelled.`,
        400
      );
    }
    throw new HttpError(
      "Cancellation requests are not available for this order state. Contact support if you need help.",
      400
    );
  }

  if (type === "REFUND") {
    if (order.paymentStatus === "REFUNDED") {
      throw new HttpError(
        "This order has already been refunded; no further refund/replacement can be requested.",
        400
      );
    }
    if (order.paymentStatus === "REFUND_INITIATED") {
      throw new HttpError(
        "A refund is already in progress for this order; you cannot open another refund or replacement request yet.",
        400
      );
    }
    if (order.paymentStatus === "REFUND_FAILED") {
      throw new HttpError(
        "This order’s refund could not be completed automatically. Please contact support — our team will resolve it manually.",
        400
      );
    }
    if (order.paymentStatus !== "PAID") {
      throw new HttpError(
        `${type.toLowerCase()} requests are only available for paid orders.`,
        400
      );
    }
    if (!["DELIVERED", "FULFILLED"].includes(order.orderStatus)) {
      throw new HttpError(
        `${type.toLowerCase()} requests can only be opened after the order is delivered (current status: ${order.orderStatus}).`,
        400
      );
    }
    return;
  }
};

const createRequest = async (
  userId,
  orderId,
  { type, reason = "", attachments = [] } = {}
) => {
  if (!type) throw new HttpError("type is required", 400);
  const order = await ensureOwnedOrder(orderId, userId);
  assertCanCreate(order, type);
  await ensureNoOpenRequest(order._id, type);

  const session = await mongoose.startSession();
  let request;
  try {
    await session.withTransaction(async () => {
      const requestNumber = await nextRequestNumber(session);
      [request] = await OrderRequest.create(
        [
          {
            requestNumber,
            order: order._id,
            user: userId,
            type,
            reason: reason || "",
            attachments: Array.isArray(attachments) ? attachments : [],
            status: "PENDING",
            history: [
              {
                status: "PENDING",
                at: new Date(),
                note: `Request opened by user`,
                by: userId,
              },
            ],
          },
        ],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  const populated = await OrderRequest.findById(request._id).populate(
    "order",
    "orderNumber orderStatus paymentStatus totalAmount currency"
  );

  if (type === "REFUND") {
    adminNotificationService.notifyRefundRequest(populated).catch((err) =>
      console.error(
        "[orderRequestService] admin REFUND_REQUEST notification failed:",
        err?.message || err
      )
    );
  }

  return populated;
};

const listMyRequests = async (userId, q = {}) => {
  const page = Number(q.page) || 1;
  const limit = Number(q.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = { user: userId, isDeleted: { $ne: true } };
  if (q.status) filter.status = q.status;
  if (q.type) filter.type = q.type;

  const [items, total] = await Promise.all([
    OrderRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("order", "orderNumber orderStatus paymentStatus totalAmount currency"),
    OrderRequest.countDocuments(filter),
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

const listAllRequests = async (q = {}) => {
  const page = Number(q.page) || 1;
  const limit = Number(q.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = { isDeleted: { $ne: true } };
  if (q.status) filter.status = q.status;
  if (q.type) filter.type = q.type;
  if (q.user) filter.user = q.user;

  const [items, total] = await Promise.all([
    OrderRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "fullName email phone role")
      .populate("order", "orderNumber orderStatus paymentStatus totalAmount currency"),
    OrderRequest.countDocuments(filter),
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

const getRequestById = async (requestId, { userId = null, isAdmin = false } = {}) => {
  const filter = { _id: requestId, isDeleted: { $ne: true } };
  if (!isAdmin && userId) filter.user = userId;
  const request = await OrderRequest.findOne(filter)
    .populate("order", "orderNumber orderStatus paymentStatus totalAmount currency")
    .populate("user", "fullName email phone role")
    .populate("replacementOrder", "orderNumber orderStatus paymentStatus totalAmount currency");
  if (!request) throw new HttpError("Request not found", 404);
  return request;
};

const appendRequestHistory = (request, status, note, actorUserId) => {
  request.history = request.history || [];
  request.history.push({
    status,
    at: new Date(),
    note: note || "",
    by: actorUserId || null,
  });
};

const approveRequest = async (
  requestId,
  { adminNote = "" } = {},
  { actorUserId }
) => {
  const request = await OrderRequest.findOne({
    _id: requestId,
    isDeleted: { $ne: true },
  });
  if (!request) throw new HttpError("Request not found", 404);
  if (request.status !== "PENDING") {
    throw new HttpError(
      `Request is already ${request.status}; cannot approve again.`,
      400
    );
  }

  const order = await Order.findOne({
    _id: request.order,
    isDeleted: { $ne: true },
  });
  if (!order) throw new HttpError("Order not found for this request", 404);

  let finalStatus = "APPROVED";

  if (request.type === "CANCELLATION") {
    await orderService.adminCancelOrder(
      order._id,
      { reason: `Approved request ${request.requestNumber}` },
      { actorUserId }
    );
    finalStatus = "COMPLETED";
  } else if (request.type === "REFUND") {
    await orderService.adminInitiateRefund(
      order._id,
      {
        reason: `Approved request ${request.requestNumber}`,
        adminNote,
      },
      { actorUserId }
    );
    finalStatus = "APPROVED";
  }

  request.status = finalStatus;
  request.adminNote = adminNote || request.adminNote || "";
  request.resolvedBy = actorUserId || null;
  request.resolvedAt = new Date();
  appendRequestHistory(
    request,
    finalStatus,
    adminNote || `Approved by admin`,
    actorUserId
  );
  await request.save();

  orderEmailService
    .sendRequestStatusUpdate(request, { order })
    .catch((err) =>
      console.error(
        "[orderRequestService] sendRequestStatusUpdate (approve) failed:",
        err?.message || err
      )
    );

  return OrderRequest.findById(request._id)
    .populate("order", "orderNumber orderStatus paymentStatus totalAmount currency");
};

const rejectRequest = async (
  requestId,
  { adminNote = "" } = {},
  { actorUserId }
) => {
  const request = await OrderRequest.findOne({
    _id: requestId,
    isDeleted: { $ne: true },
  });
  if (!request) throw new HttpError("Request not found", 404);
  if (request.status !== "PENDING") {
    throw new HttpError(
      `Request is already ${request.status}; cannot reject again.`,
      400
    );
  }

  request.status = "REJECTED";
  request.adminNote = adminNote || request.adminNote || "";
  request.resolvedBy = actorUserId || null;
  request.resolvedAt = new Date();
  appendRequestHistory(
    request,
    "REJECTED",
    adminNote || `Rejected by admin`,
    actorUserId
  );
  await request.save();

  const order = await Order.findById(request.order);
  orderEmailService
    .sendRequestStatusUpdate(request, { order })
    .catch((err) =>
      console.error(
        "[orderRequestService] sendRequestStatusUpdate (reject) failed:",
        err?.message || err
      )
    );

  return OrderRequest.findById(request._id).populate(
    "order",
    "orderNumber orderStatus paymentStatus totalAmount currency"
  );
};

module.exports = {
  createRequest,
  listMyRequests,
  listAllRequests,
  getRequestById,
  approveRequest,
  rejectRequest,
  _internal: { nextRequestNumber },
};
