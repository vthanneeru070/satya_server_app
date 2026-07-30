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
    const message =
      request?.type === "REFUND" && refund
        ? refund.outcome === "REFUNDED"
          ? "Return approved — PayFast refund completed."
          : refund.manual
            ? "Return approved — complete the refund in the PayFast merchant portal (sandbox/manual)."
            : "Return approved — PayFast refund submitted. Funds usually return in 5–10 business days."
        : "Request approved";
    return sendSuccess(res, { request, refund }, message);
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

module.exports = {
  createRequest,
  listMyRequests,
  listAllRequests,
  getRequestById,
  approveRequest,
  rejectRequest,
};
