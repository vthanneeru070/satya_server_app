const { sendSuccess } = require("../utils/response");
const paymentService = require("../services/paymentService");
const paystackService = require("../services/paystackService");

const isAdminRole = (req) =>
  req.user?.role === "admin" || req.user?.role === "superadmin";

const initializePayment = async (req, res, next) => {
  try {
    const data = await paymentService.initializePayment(req.body.orderId, {
      userId: req.user.userId,
      isAdmin: isAdminRole(req),
      callbackUrl: req.body?.callbackUrl,
    });
    return sendSuccess(res, data, "Paystack transaction initialized");
  } catch (error) {
    return next(error);
  }
};

const verifyPayment = async (req, res, next) => {
  try {
    const { reference } = req.params;
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

const paystackWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-paystack-signature"];
    const raw = req.rawBody || JSON.stringify(req.body || {});
    const valid = paystackService.verifyWebhookSignature(raw, signature);
    if (!valid) {
      console.warn("[paystack] webhook signature mismatch — rejecting");
      return res.status(401).json({ success: false, message: "Invalid signature" });
    }

    const event =
      req.body && typeof req.body === "object" ? req.body : JSON.parse(raw);

    const result = await paymentService.handlePaystackWebhook(event);
    console.log("[paystack] webhook processed:", JSON.stringify(result));
    return res.status(200).json({ received: true, ...result });
  } catch (err) {
    console.error("[paystack] webhook handler error:", err?.message);
    return res.status(200).json({ received: true, error: err?.message });
  }
};

const listAllPayments = async (req, res, next) => {
  try {
    const data = await paymentService.listAllPayments(req.query);
    return sendSuccess(res, data, "Payments fetched successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  initializePayment,
  verifyPayment,
  paystackWebhook,
  listAllPayments,
};
