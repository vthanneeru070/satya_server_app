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
    const order = await orderService.cancelMyOrder(req.params.id, req.user.userId, {
      reason: req.body.reason,
    });
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

const setTracking = async (req, res, next) => {
  try {
    const order = await orderService.adminSetTracking(req.params.id, req.body, {
      actorUserId: req.user.userId,
    });
    return sendSuccess(res, { order }, "Tracking details updated");
  } catch (error) {
    return next(error);
  }
};

const dispatchOrder = async (req, res, next) => {
  try {
    const order = await orderService.dispatchOrder(req.params.id, req.body, {
      actorUserId: req.user.userId,
    });
    return sendSuccess(res, { order }, "Order dispatched");
  } catch (error) {
    return next(error);
  }
};

const readyForPickup = async (req, res, next) => {
  try {
    const order = await orderService.readyForPickup(req.params.id, req.body, {
      actorUserId: req.user.userId,
    });
    return sendSuccess(res, { order }, "Order marked ready for pickup");
  } catch (error) {
    return next(error);
  }
};

const markPacked = async (req, res, next) => {
  try {
    const order = await orderService.markPacked(req.params.id, req.body, {
      actorUserId: req.user.userId,
    });
    return sendSuccess(res, { order }, "Order marked packed");
  } catch (error) {
    return next(error);
  }
};

const verifyPickup = async (req, res, next) => {
  try {
    const order = await orderService.verifyPickup(req.params.id, req.body, {
      actorUserId: req.user.userId,
    });
    return sendSuccess(res, { order }, "Pickup verified — order completed");
  } catch (error) {
    return next(error);
  }
};

const syncDeliveryPod = async (req, res, next) => {
  try {
    const order = await orderService.syncDeliveryPod(req.params.id, {
      actorUserId: req.user.userId,
    });
    return sendSuccess(res, { order }, "Delivery POD status refreshed");
  } catch (error) {
    return next(error);
  }
};

const getShippingLabelUrl = async (req, res, next) => {
  try {
    const data = await orderService.getShippingLabelUrl(req.params.id);
    return sendSuccess(res, data, "Shipping label URL fetched");
  } catch (error) {
    return next(error);
  }
};

const rebookCourier = async (req, res, next) => {
  try {
    const order = await orderService.rebookCourierShipment(req.params.id, {
      actorUserId: req.user.userId,
    });
    return sendSuccess(res, { order }, "Courier shipment rebooked");
  } catch (error) {
    return next(error);
  }
};

const streamShippingLabel = async (req, res, next) => {
  try {
    const asset = await orderService.getShippingLabelStream(req.params.id);
    // Always stream PDF bytes — never redirect to labels.shiplogic.com (CORS on Flutter web).
    if (asset.type !== "pdf" || !asset.data) {
      const HttpError = require("../utils/httpError");
      throw new HttpError("Courier shipping label PDF was not available", 502);
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${asset.filename || "shipping-label.pdf"}"`
    );
    return res.send(asset.data);
  } catch (error) {
    return next(error);
  }
};

const confirmDelivery = async (req, res, next) => {
  try {
    const order = await orderService.confirmDelivery(
      req.params.id,
      req.user.userId,
      req.body
    );
    return sendSuccess(
      res,
      { order },
      order.fulfillment?.satisfied
        ? "Thanks for confirming receipt — order marked as fulfilled."
        : "Thanks for the feedback. Open a refund or replacement request from the app."
    );
  } catch (error) {
    return next(error);
  }
};

const adminCancelPaidOrder = async (req, res, next) => {
  try {
    const order = await orderService.adminCancelOrder(req.params.id, req.body, {
      actorUserId: req.user.userId,
    });
    return sendSuccess(res, { order }, "Order cancelled by admin");
  } catch (error) {
    return next(error);
  }
};

const adminInitiateRefund = async (req, res, next) => {
  try {
    const result = await orderService.adminInitiateRefund(req.params.id, req.body, {
      actorUserId: req.user.userId,
    });
    const msg =
      result.refund.outcome === "REFUNDED"
        ? "Refund processed successfully"
        : result.refund.outcome === "PENDING"
          ? result.refund.manual
            ? result.refund.apiAttempted
              ? "PayFast API refund unavailable in sandbox — complete in PayFast merchant portal"
              : "Refund initiated — complete in PayFast merchant portal"
            : "Refund initiated via PayFast — awaiting gateway confirmation"
          : "Refund failed — see order.refund.lastError";
    return sendSuccess(res, result, msg);
  } catch (error) {
    return next(error);
  }
};

/** @deprecated Use POST /api/v1/payments/initialize or /orders/:id/payments/payfast/initialize */
const initializePaystack = async (req, res, next) => {
  return initializePayfast(req, res, next);
};

const initializePayfast = async (req, res, next) => {
  try {
    const data = await paymentService.initializePayment(req.params.id, {
      userId: req.user.userId,
      isAdmin: isAdminRole(req),
      callbackUrl: req.body?.callbackUrl,
    });
    return sendSuccess(res, data, "PayFast transaction initialized");
  } catch (error) {
    return next(error);
  }
};

/** @deprecated Use GET /api/v1/payments/verify/:reference or /orders/:id/payments/payfast/verify */
const verifyPaystack = async (req, res, next) => {
  return verifyPayfast(req, res, next);
};

const verifyPayfast = async (req, res, next) => {
  try {
    const reference =
      req.body?.reference || req.query?.reference || req.params?.reference;
    const payfastNotify = paymentService.extractPayfastItnFromVerifyPayload(
      req.body,
      reference
    );
    const result = await paymentService.verifyPaymentByReference(reference, {
      userId: req.user.userId,
      isAdmin: isAdminRole(req),
      payfastNotify,
    });
    const msg =
      result.status === "success"
        ? "Payment verified successfully"
        : result.status === "pending"
          ? "Payment is still pending PayFast confirmation"
          : `Payment verification returned status: ${result.status}`;
    return sendSuccess(
      res,
      result,
      msg,
      result.status === "pending" ? 202 : 200
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
  setTracking,
  dispatchOrder,
  readyForPickup,
  markPacked,
  verifyPickup,
  syncDeliveryPod,
  getShippingLabelUrl,
  streamShippingLabel,
  rebookCourier,
  confirmDelivery,
  adminCancelPaidOrder,
  adminInitiateRefund,
  initializePayfast,
  verifyPayfast,
  initializePaystack,
  verifyPaystack,
};
