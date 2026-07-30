const { sendSuccess } = require("../utils/response");
const orderRequestService = require("../services/orderRequestService");

const isAdminRole = (req) =>
  req.user?.role === "admin" || req.user?.role === "superadmin";

const createRequest = async (req, res, next) => {
  try {
    const request = await orderRequestService.createRequest(
      req.user.userId,
      req.params.id,
      req.body
    );
    return sendSuccess(res, { request }, "Request submitted", 201);
  } catch (error) {
    return next(error);
  }
};

const listMyRequests = async (req, res, next) => {
  try {
    const result = await orderRequestService.listMyRequests(
      req.user.userId,
      req.query
    );
    return sendSuccess(res, result, "Requests fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const listAllRequests = async (req, res, next) => {
  try {
    const result = await orderRequestService.listAllRequests(req.query);
    return sendSuccess(res, result, "Requests fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const getRequestById = async (req, res, next) => {
  try {
    const request = await orderRequestService.getRequestById(
      req.params.requestId,
      { userId: req.user.userId, isAdmin: isAdminRole(req) }
    );
    return sendSuccess(res, { request }, "Request fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const approveRequest = async (req, res, next) => {
  try {
    const result = await orderRequestService.approveRequest(
      req.params.requestId,
      req.body,
      { actorUserId: req.user.userId }
    );
    const request = result?.request || result;
    const refund = result?.refund || null;

    let message = "Request approved";
    if (request?.type === "REFUND") {
      if (result?.returnBooked) {
        message =
          "Return approved — Courier Guy collection booked. Refund starts after the warehouse receives the item.";
      } else if (result?.returnBookError) {
        message = `Return approved — awaiting item return. Courier booking failed (${result.returnBookError}). Retry booking or mark return received manually.`;
      } else {
        message =
          request.fulfillmentMethod === "PICKUP"
            ? "Return approved — customer should drop the item at the warehouse. Mark return received to start the refund."
            : "Return approved — awaiting return. Refund starts after the item is received.";
      }
    }

    return sendSuccess(
      res,
      {
        request,
        refund,
        returnBooked: result?.returnBooked ?? null,
        returnBookError: result?.returnBookError ?? null,
      },
      message
    );
  } catch (error) {
    return next(error);
  }
};

const rejectRequest = async (req, res, next) => {
  try {
    const request = await orderRequestService.rejectRequest(
      req.params.requestId,
      req.body,
      { actorUserId: req.user.userId }
    );
    return sendSuccess(res, { request }, "Request rejected");
  } catch (error) {
    return next(error);
  }
};

const bookReturn = async (req, res, next) => {
  try {
    const request = await orderRequestService.bookReturnShipment(
      req.params.requestId,
      { actorUserId: req.user.userId }
    );
    return sendSuccess(
      res,
      { request },
      "Return collection booked with Courier Guy"
    );
  } catch (error) {
    return next(error);
  }
};

const markReturnReceived = async (req, res, next) => {
  try {
    const result = await orderRequestService.markReturnReceived(
      req.params.requestId,
      { actorUserId: req.user.userId }
    );
    const request = result.request;
    const refund = result.refund;
    let message = "Return received";
    if (refund?.outcome === "REFUNDED") {
      message = "Return received — PayFast refund completed.";
    } else if (refund?.outcome === "PENDING") {
      message = refund.manual
        ? "Return received — complete the refund in the PayFast merchant portal."
        : "Return received — PayFast refund submitted. Funds usually return in 5–10 business days.";
    } else if (result.alreadyDone) {
      message = "Return already processed for this request.";
    }
    return sendSuccess(res, { request, refund }, message);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createRequest,
  listMyRequests,
  listAllRequests,
  getRequestById,
  approveRequest,
  rejectRequest,
  bookReturn,
  markReturnReceived,
};
