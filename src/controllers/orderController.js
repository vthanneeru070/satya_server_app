const { sendSuccess } = require("../utils/response");
const orderService = require("../services/orderService");
const paymentService = require("../services/paymentService");

const isAdminRole = (req) =>
  req.user?.role === "admin" || req.user?.role === "superadmin";

const checkout = async (req, res, next) => {
  try {
    const order = await orderService.checkoutFromCart(req.user.userId, req.body);
    return sendSuccess(res, { order }, "Order created — complete payment to confirm", 201);
  } catch (error) {
    return next(error);
  }
};

const createOrder = async (req, res, next) => {
  try {
    const order = await orderService.createOrder(req.user.userId, req.body);
    return sendSuccess(res, { order }, "Order created successfully", 201);
  } catch (error) {
    return next(error);
  }
};

const getMyOrders = async (req, res, next) => {
  try {
    const result = await orderService.listMyOrders(req.user.userId, req.query);
    return sendSuccess(res, result, "Orders fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const getAllOrders = async (req, res, next) => {
  try {
    const result = await orderService.listAllOrders(req.query);
    return sendSuccess(res, result, "Orders fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const getOrderById = async (req, res, next) => {
  try {
    const order = await orderService.getOrderById(req.params.id, {
      userId: req.user.userId,
      isAdmin: isAdminRole(req),
    });
    return sendSuccess(res, { order }, "Order fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const updateOrderStatus = async (req, res, next) => {
  try {
    const order = await orderService.updateStatus(req.params.id, req.body, {
      actorUserId: req.user.userId,
    });
    return sendSuccess(res, { order }, "Order status updated");
  } catch (error) {
    return next(error);
  }
};

const cancelMyOrder = async (req, res, next) => {
  try {
    const order = await orderService.cancelMyOrder(req.params.id, req.user.userId);
    return sendSuccess(res, { order }, "Order cancelled");
  } catch (error) {
    return next(error);
  }
};

const updatePayment = async (req, res, next) => {
  try {
    const order = await orderService.updatePayment(req.params.id, req.body, {
      actorUserId: req.user.userId,
    });
    return sendSuccess(res, { order }, "Order payment updated");
  } catch (error) {
    return next(error);
  }
};

/** @deprecated Use POST /api/v1/payments/initialize with body { orderId } */
const initializePaystack = async (req, res, next) => {
  try {
    const data = await paymentService.initializePayment(req.params.id, {
      userId: req.user.userId,
      isAdmin: isAdminRole(req),
      callbackUrl: req.body?.callbackUrl,
    });
    return sendSuccess(res, data, "Paystack transaction initialized");
  } catch (error) {
    return next(error);
  }
};

/** @deprecated Use GET /api/v1/payments/verify/:reference */
const verifyPaystack = async (req, res, next) => {
  try {
    const reference =
      req.body?.reference || req.query?.reference || req.params?.reference;
    const result = await paymentService.verifyPaymentByReference(reference, {
      userId: req.user.userId,
      isAdmin: isAdminRole(req),
    });
    return sendSuccess(
      res,
      result,
      result.status === "success"
        ? "Payment verified successfully"
        : `Payment verification returned status: ${result.status}`
    );
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  checkout,
  createOrder,
  getMyOrders,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  cancelMyOrder,
  updatePayment,
  initializePaystack,
  verifyPaystack,
};
