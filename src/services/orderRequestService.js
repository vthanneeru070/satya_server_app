const mongoose = require("mongoose");
const OrderRequest = require("../models/OrderRequest");
const Order = require("../models/Order");
const Warehouse = require("../models/Warehouse");
const Counter = require("../models/Counter");
const HttpError = require("../utils/httpError");
const orderService = require("./orderService");
const orderEmailService = require("./orderEmailService");
const adminNotificationService = require("./adminNotificationService");
const shippingShipmentService = require("./shippingShipmentService");
const {
  resolveAffectedItems,
  computeRefundAmount,
  assertPostFulfilmentForRequests,
} = require("../utils/orderAffectedItems");

const REQUEST_PREFIX = process.env.REQUEST_NUMBER_PREFIX || "REQ";

const OPEN_REFUND_STATUSES = ["PENDING", "AWAITING_RETURN", "APPROVED"];
const RETURN_ACTIONABLE_STATUSES = new Set(["AWAITING_RETURN"]);

const ORDER_POPULATE =
  "orderNumber orderStatus paymentStatus totalAmount currency fulfillmentMethod";

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
  const openStatuses =
    type === "REFUND" ? OPEN_REFUND_STATUSES : ["PENDING", "APPROVED"];
  const exists = await OrderRequest.findOne({
    order: orderId,
    type,
    status: { $in: openStatuses },
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
        "This order has already been fully refunded; no further refund/replacement can be requested.",
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
      if (order.fulfillmentMethod === "PICKUP") {
        assertPostFulfilmentForRequests(order, `${type.toLowerCase()} requests`);
      } else {
        throw new HttpError(
          `${type.toLowerCase()} requests can only be opened after the order is delivered (current status: ${order.orderStatus}).`,
          400
        );
      }
    }
    return;
  }
};

const buildReturnInstructions = (fulfillmentMethod, { pickupLocation, warehouse } = {}) => {
  if (fulfillmentMethod === "PICKUP") {
    const loc = pickupLocation || {};
    const name = warehouse?.name || loc.company || "the warehouse";
    const addr =
      loc.enteredAddress ||
      [loc.streetAddress, loc.localArea, loc.city, loc.postalCode]
        .filter(Boolean)
        .join(", ");
    const hours = loc.hours || warehouse?.hours || "";
    return [
      `Bring the item(s) to return to ${name}.`,
      addr ? `Address: ${addr}` : "",
      hours ? `Hours: ${hours}` : "",
      "Bring your order number and a valid ID. Your refund starts after we confirm receipt.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return "A courier will collect the item(s) from your delivery address. Your refund starts after the warehouse receives the return.";
};

const setupReturnShipmentOnApprove = async (request, order) => {
  const fulfillmentMethod = order.fulfillmentMethod || "DELIVERY";
  request.fulfillmentMethod = fulfillmentMethod;

  if (fulfillmentMethod === "PICKUP") {
    let warehouse = null;
    if (order.warehouse) {
      warehouse = await Warehouse.findById(order.warehouse).lean();
    }
    request.returnShipment = {
      method: "WAREHOUSE_DROP_OFF",
      status: "AWAITING_RETURN",
      instructions: buildReturnInstructions("PICKUP", {
        pickupLocation: order.pickupLocation,
        warehouse,
      }),
      provider: "",
    };
    return { booked: false, bookError: null };
  }

  request.returnShipment = {
    method: "COURIER_COLLECTION",
    status: "AWAITING_RETURN",
    instructions: buildReturnInstructions("DELIVERY"),
    provider: "",
  };

  try {
    await shippingShipmentService.bookReturnShipmentForRequest(request, order, {
      purpose: "refund",
    });
    return { booked: true, bookError: null };
  } catch (err) {
    console.error(
      `[orderRequestService] auto-book TCG return failed for ${request.requestNumber}:`,
      err?.message || err
    );
    return {
      booked: false,
      bookError: err?.message || "Could not book Courier Guy return collection",
    };
  }
};

const populateRequest = (id) =>
  OrderRequest.findById(id)
    .populate("order", ORDER_POPULATE)
    .populate("user", "fullName email phone role");

const createRequest = async (
  userId,
  orderId,
  { type, reason = "", attachments = [], affectedItems: rawAffectedItems = [] } = {}
) => {
  if (!type) throw new HttpError("type is required", 400);
  const order = await ensureOwnedOrder(orderId, userId);
  assertCanCreate(order, type);
  await ensureNoOpenRequest(order._id, type);

  let affectedItems = [];
  let refundAmount = null;
  const fulfillmentMethod = order.fulfillmentMethod || "DELIVERY";
  if (type === "REFUND") {
    affectedItems = resolveAffectedItems(order, rawAffectedItems);
    refundAmount = computeRefundAmount(order, affectedItems);
  }

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
            fulfillmentMethod,
            affectedItems,
            refundAmount,
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

  const populated = await populateRequest(request._id);

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
      .populate("order", ORDER_POPULATE),
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
      .populate("order", ORDER_POPULATE),
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
    .populate("order", ORDER_POPULATE)
    .populate("user", "fullName email phone role")
    .populate(
      "replacementOrder",
      "orderNumber orderStatus paymentStatus totalAmount currency"
    );
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

  if (request.type === "CANCELLATION") {
    await orderService.adminCancelOrder(
      order._id,
      { reason: `Approved request ${request.requestNumber}` },
      { actorUserId }
    );
    request.status = "COMPLETED";
    request.adminNote = adminNote || request.adminNote || "";
    request.resolvedBy = actorUserId || null;
    request.resolvedAt = new Date();
    appendRequestHistory(
      request,
      "COMPLETED",
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

    const populated = await populateRequest(request._id);
    return { request: populated, refund: null };
  }

  if (request.type !== "REFUND") {
    throw new HttpError(`Unsupported request type: ${request.type}`, 400);
  }

  const { booked, bookError } = await setupReturnShipmentOnApprove(request, order);

  let historyNote = adminNote || "Return approved — awaiting item return";
  if (booked) {
    historyNote += " | Courier Guy return collection booked";
  } else if (bookError) {
    historyNote += ` | TCG booking deferred: ${bookError}`;
  }

  request.status = "AWAITING_RETURN";
  request.adminNote = adminNote || request.adminNote || "";
  request.resolvedBy = null;
  request.resolvedAt = null;
  appendRequestHistory(request, "AWAITING_RETURN", historyNote, actorUserId);
  await request.save();

  const populated = await populateRequest(request._id);

  orderEmailService
    .sendRequestStatusUpdate(request, { order: populated.order })
    .catch((err) =>
      console.error(
        "[orderRequestService] sendRequestStatusUpdate (approve return) failed:",
        err?.message || err
      )
    );

  return {
    request: populated,
    refund: null,
    returnBooked: booked,
    returnBookError: bookError,
  };
};

const bookReturnShipment = async (requestId, { actorUserId } = {}) => {
  const request = await OrderRequest.findOne({
    _id: requestId,
    isDeleted: { $ne: true },
  });
  if (!request) throw new HttpError("Request not found", 404);
  if (request.type !== "REFUND") {
    throw new HttpError("Return collection booking applies only to refund requests", 400);
  }
  if (!RETURN_ACTIONABLE_STATUSES.has(request.status)) {
    throw new HttpError(
      `Cannot book return when request status is ${request.status}.`,
      400
    );
  }
  if (request.fulfillmentMethod === "PICKUP") {
    throw new HttpError(
      "Pickup returns use warehouse drop-off. Mark return received when the item arrives.",
      400
    );
  }
  if (request.returnShipment?.status === "RETURN_RECEIVED") {
    throw new HttpError("Return already received for this request", 400);
  }
  if (request.returnShipment?.shipmentId) {
    return populateRequest(request._id);
  }

  const order = await Order.findOne({
    _id: request.order,
    isDeleted: { $ne: true },
  });
  if (!order) throw new HttpError("Order not found for this request", 404);

  await shippingShipmentService.bookReturnShipmentForRequest(request, order, {
    actorUserId,
    purpose: "refund",
  });
  appendRequestHistory(
    request,
    request.status,
    "Courier Guy return collection booked",
    actorUserId
  );
  await request.save();
  return populateRequest(request._id);
};

/**
 * Confirm physical return, then initiate PayFast refund.
 * Idempotent if return already received and refund already started/completed.
 */
const markReturnReceived = async (requestId, { actorUserId } = {}) => {
  const request = await OrderRequest.findOne({
    _id: requestId,
    isDeleted: { $ne: true },
  });
  if (!request) throw new HttpError("Request not found", 404);
  if (request.type !== "REFUND") {
    throw new HttpError("Mark return received applies only to refund requests", 400);
  }

  if (request.status === "COMPLETED" || request.status === "APPROVED") {
    const populated = await populateRequest(request._id);
    return { request: populated, refund: null, alreadyDone: true };
  }

  if (!RETURN_ACTIONABLE_STATUSES.has(request.status)) {
    throw new HttpError(
      `Cannot mark return received when request status is ${request.status}.`,
      400
    );
  }

  const order = await Order.findOne({
    _id: request.order,
    isDeleted: { $ne: true },
  });
  if (!order) throw new HttpError("Order not found for this request", 404);

  request.returnShipment = {
    ...(request.returnShipment?.toObject?.() || request.returnShipment || {}),
    status: "RETURN_RECEIVED",
    receivedAt: new Date(),
    receivedBy: actorUserId || null,
  };

  const refundAmount =
    request.refundAmount ??
    computeRefundAmount(order, request.affectedItems || []);

  const { refund } = await orderService.adminInitiateRefund(
    order._id,
    {
      reason: `Return received for ${request.requestNumber}`,
      adminNote: request.adminNote || "",
      amountInMajor: refundAmount,
    },
    { actorUserId }
  );

  let finalStatus;
  if (refund.outcome === "REFUNDED") {
    finalStatus = "COMPLETED";
  } else if (refund.outcome === "PENDING") {
    finalStatus = "APPROVED";
  } else {
    throw new HttpError(
      refund.error ||
        refund.manualNote ||
        "PayFast refund could not be completed automatically. Check the order payment details and try again, or refund manually in the PayFast merchant portal.",
      502
    );
  }

  request.status = finalStatus;
  request.resolvedBy = actorUserId || null;
  request.resolvedAt = new Date();
  appendRequestHistory(
    request,
    finalStatus,
    `Return received — refund ${refund.outcome}`,
    actorUserId
  );
  await request.save();

  const populated = await populateRequest(request._id);

  orderEmailService
    .sendRequestStatusUpdate(request, { order: populated.order })
    .catch((err) =>
      console.error(
        "[orderRequestService] sendRequestStatusUpdate (return received) failed:",
        err?.message || err
      )
    );

  return { request: populated, refund, alreadyDone: false };
};

/**
 * Apply a ShipLogic status to an open refund return shipment.
 * When delivered, marks return received and initiates refund.
 */
const applyReturnTrackingStatus = async (requestId, shipLogicStatus, { actorUserId } = {}) => {
  const request = await OrderRequest.findOne({
    _id: requestId,
    type: "REFUND",
    isDeleted: { $ne: true },
  });
  if (!request) return { changed: false };

  const mapped =
    shippingShipmentService.mapShipLogicStatusToReturnShipmentStatus(shipLogicStatus);
  if (!mapped) return { changed: false };

  const current = request.returnShipment?.status || "";
  if (current === "RETURN_RECEIVED") return { changed: false };

  if (mapped === "RETURN_RECEIVED") {
    const result = await markReturnReceived(requestId, { actorUserId });
    return { changed: true, request: result.request, refund: result.refund };
  }

  if (
    mapped === "RETURN_IN_TRANSIT" &&
    ["AWAITING_RETURN", "RETURN_BOOKED"].includes(current)
  ) {
    request.returnShipment = {
      ...(request.returnShipment?.toObject?.() || request.returnShipment || {}),
      status: "RETURN_IN_TRANSIT",
      courierStatus: String(shipLogicStatus || ""),
    };
    await request.save();
    return { changed: true, request };
  }

  if (request.returnShipment) {
    request.returnShipment.courierStatus = String(shipLogicStatus || "");
    await request.save();
  }

  return { changed: false };
};

/**
 * Admin: poll TCG for return shipment status (advances mock / pulls live status).
 * On delivered, marks return received and initiates refund.
 */
const syncReturnShipment = async (requestId, { actorUserId } = {}) => {
  const request = await OrderRequest.findOne({
    _id: requestId,
    isDeleted: { $ne: true },
  });
  if (!request) throw new HttpError("Request not found", 404);
  if (request.type !== "REFUND") {
    throw new HttpError("Return tracking sync applies only to refund requests", 400);
  }
  if (request.fulfillmentMethod === "PICKUP") {
    throw new HttpError(
      "Pickup returns do not use Courier Guy. Mark return received when the item arrives at the warehouse.",
      400
    );
  }
  if (request.status === "COMPLETED" || request.status === "APPROVED") {
    return {
      request: await populateRequest(request._id),
      changed: false,
      courierStatus: request.returnShipment?.courierStatus || "",
      alreadyDone: true,
    };
  }
  if (request.status !== "AWAITING_RETURN") {
    throw new HttpError(
      `Cannot sync return tracking when request status is ${request.status}.`,
      400
    );
  }

  const shipmentId = String(request.returnShipment?.shipmentId || "").trim();
  const trackingReference = String(
    request.returnShipment?.shortTrackingReference ||
      request.returnShipment?.waybill ||
      ""
  ).trim();
  if (!shipmentId && !trackingReference) {
    throw new HttpError(
      "No Courier Guy return shipment to sync. Book return collection first.",
      400
    );
  }

  const tcgClient = require("../integrations/tcg/tcgClient");
  const shipment = await tcgClient.getShipment({
    id: shipmentId || undefined,
    trackingReference: trackingReference || undefined,
  });
  const courierStatus = shipment?.status || null;
  if (!courierStatus) {
    throw new HttpError("Courier Guy did not return a status for this shipment", 502);
  }

  const result = await applyReturnTrackingStatus(requestId, courierStatus, {
    actorUserId,
  });

  const populated =
    result.request || (await populateRequest(request._id));

  return {
    request: populated,
    changed: Boolean(result.changed),
    courierStatus: String(courierStatus),
    refund: result.refund || null,
    alreadyDone: false,
  };
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

  return populateRequest(request._id);
};

module.exports = {
  createRequest,
  listMyRequests,
  listAllRequests,
  getRequestById,
  approveRequest,
  rejectRequest,
  bookReturnShipment,
  markReturnReceived,
  applyReturnTrackingStatus,
  syncReturnShipment,
  _internal: { nextRequestNumber, OPEN_REFUND_STATUSES },
};
