const crypto = require("crypto");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const User = require("../models/User");
const HttpError = require("../utils/httpError");
const paystackService = require("./paystackService");
const { notifyOrderPlaced } = require("./fcmOrderNotifyService");

const appendOrderHistory = (order, status, note = "") => {
  order.orderStatusHistory = order.orderStatusHistory || [];
  order.orderStatusHistory.push({ status, at: new Date(), note });
};

/**
 * Initialize Paystack for an order; persists Payment (PENDING) + order.paystackReference.
 */
const initializePayment = async (orderId, { userId, isAdmin = false, callbackUrl } = {}) => {
  const order = await Order.findOne({ _id: orderId, isDeleted: { $ne: true } });
  if (!order) throw new HttpError("Order not found", 404);
  if (!isAdmin && String(order.user) !== String(userId)) {
    throw new HttpError("Order not found", 404);
  }
  if (order.paymentStatus === "PAID") {
    throw new HttpError("Order is already paid", 400);
  }
  if (["DELIVERED", "CANCELLED"].includes(order.orderStatus)) {
    throw new HttpError(`Order is ${order.orderStatus} and cannot be paid for.`, 400);
  }

  const user = await User.findById(order.user).select("email fullName");
  const email = user?.email;
  if (!email) {
    throw new HttpError(
      "An email is required on the user account to start a Paystack payment.",
      400
    );
  }

  const reference = `PSK-${order.orderNumber}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

  const initData = await paystackService.initializeTransaction({
    email,
    amountInMajor: order.totalAmount,
    currency: order.currency,
    reference,
    callbackUrl,
    metadata: {
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      userId: String(order.user),
    },
  });

  const payment = await Payment.create({
    user: order.user,
    order: order._id,
    paymentFor: "ORDER",
    amount: order.totalAmount,
    currency: order.currency,
    gateway: "PAYSTACK",
    reference: initData.reference,
    status: "PENDING",
    response: { initialize: initData },
  });

  order.paymentMethod = "PAYSTACK";
  order.paystackReference = initData.reference;
  await order.save();

  return {
    paymentId: payment._id,
    reference: initData.reference,
    accessCode: initData.access_code,
    authorization_url: initData.authorization_url,
    authorizationUrl: initData.authorization_url,
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || null,
    amount: order.totalAmount,
    currency: order.currency,
    email,
  };
};

const applyStockDecrement = async (order, session) => {
  const ops = order.items.map((line) => ({
    updateOne: {
      filter: {
        _id: line.product,
        stockQuantity: { $gte: line.quantity },
        isDeleted: { $ne: true },
      },
      update: {
        $inc: { stockQuantity: -line.quantity, purchaseCount: line.quantity },
      },
    },
  }));
  if (!ops.length) return;
  const result = await Product.bulkWrite(ops, { session });
  if (result.modifiedCount !== ops.length) {
    throw new HttpError(
      "Inventory changed while confirming payment. Please contact support with your order number.",
      409
    );
  }
};

/**
 * Server-side verify by Paystack reference. Idempotent when order is already PAID.
 * Paystack is called first; MongoDB transaction applies inventory + state changes.
 */
const verifyPaymentByReference = async (reference, { userId, isAdmin = false } = {}) => {
  if (!reference) throw new HttpError("reference is required", 400);

  const paystackData = await paystackService.verifyTransaction(reference);
  const paystackStatus = paystackData?.status;

  const session = await mongoose.startSession();
  let out;
  let shouldNotify = false;

  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findOne({ reference, isDeleted: { $ne: true } }).session(
        session
      );
      if (!payment) {
        throw new HttpError("No payment record matches this reference", 404);
      }

      const order = await Order.findById(payment.order).session(session);
      if (!order) {
        throw new HttpError("Order not found for this payment", 404);
      }
      if (!isAdmin && String(order.user) !== String(userId)) {
        throw new HttpError("No payment record matches this reference", 404);
      }

      if (order.paymentStatus === "PAID") {
        if (paystackStatus === "success" && payment.status !== "SUCCESS") {
          payment.status = "SUCCESS";
          payment.paymentId = paystackData.id != null ? String(paystackData.id) : payment.paymentId;
          payment.transactionId =
            paystackData.id != null ? String(paystackData.id) : payment.transactionId;
          payment.response = { ...(payment.response || {}), verify: paystackData };
          await payment.save({ session });
        }
        out = { order, payment, status: "success", alreadyPaid: true };
        return;
      }

      if (paystackStatus === "success") {
        const expected = paystackService.toSubunit(order.totalAmount, order.currency);
        if (Number(paystackData.amount) !== expected) {
          throw new HttpError(
            `Paystack amount mismatch (expected ${expected}, got ${paystackData.amount}).`,
            409
          );
        }
        if (String(paystackData.currency).toUpperCase() !== String(order.currency).toUpperCase()) {
          throw new HttpError(
            `Paystack currency mismatch (expected ${order.currency}, got ${paystackData.currency}).`,
            409
          );
        }

        await applyStockDecrement(order, session);

        payment.status = "SUCCESS";
        payment.paymentId = paystackData.id != null ? String(paystackData.id) : null;
        payment.transactionId = paystackData.id != null ? String(paystackData.id) : null;
        payment.response = { ...(payment.response || {}), verify: paystackData };
        await payment.save({ session });

        order.paymentStatus = "PAID";
        order.transactionId = paystackData.id != null ? String(paystackData.id) : null;
        order.inventoryReserved = true;
        appendOrderHistory(order, order.orderStatus, `Paystack paid (ref: ${reference})`);
        await order.save({ session });

        await Cart.updateOne(
          { user: order.user },
          { $set: { items: [], totalAmount: 0 } },
          { session }
        );

        shouldNotify = true;
        out = { order, payment, status: "success", alreadyPaid: false };
        return;
      }

      if (paystackStatus === "abandoned" || paystackStatus === "failed") {
        payment.status = "FAILED";
        payment.response = { ...(payment.response || {}), verify: paystackData };
        await payment.save({ session });

        if (order.paymentStatus !== "PAID") {
          order.paymentStatus = "FAILED";
          appendOrderHistory(order, order.orderStatus, `Paystack payment ${paystackStatus}`);
          await order.save({ session });
        }

        out = { order, payment, status: paystackStatus, alreadyPaid: false };
        return;
      }

      payment.response = { ...(payment.response || {}), verify: paystackData };
      await payment.save({ session });
      out = { order, payment, status: paystackStatus || "unknown", alreadyPaid: false };
    });
  } finally {
    await session.endSession();
  }

  if (shouldNotify) {
    await notifyOrderPlaced(out.order.user);
  }

  return out;
};

const markPaymentFailedFromWebhook = async (reference, eventData) => {
  const payment = await Payment.findOne({ reference, isDeleted: { $ne: true } });
  if (!payment) return { ignored: true, reason: "no matching payment" };
  if (payment.status === "SUCCESS") return { ignored: true, reason: "payment already successful" };

  payment.status = "FAILED";
  payment.response = { ...(payment.response || {}), webhook: eventData };
  await payment.save();

  const order = await Order.findById(payment.order);
  if (order && order.paymentStatus === "PENDING") {
    order.paymentStatus = "FAILED";
    appendOrderHistory(order, order.orderStatus, "Paystack charge.failed webhook");
    await order.save();
  }
  return { processed: true, status: "failed", orderId: order?._id };
};

/**
 * Webhook handler — signature verified by route. Re-verifies success with Paystack API.
 */
const handlePaystackWebhook = async (event) => {
  if (!event || typeof event !== "object") return { ignored: true };

  const reference = event?.data?.reference;
  if (!reference) return { ignored: true, reason: "no reference in payload" };

  switch (event.event) {
    case "charge.success":
      try {
        const data = await paystackService.verifyTransaction(reference);
        if (data?.status === "success") {
          const payment = await Payment.findOne({ reference, isDeleted: { $ne: true } });
          if (!payment) return { ignored: true, reason: "no matching payment" };
          const result = await verifyPaymentByReference(reference, {
            userId: String(payment.user),
            isAdmin: true,
          });
          return { processed: true, status: result?.status, orderId: result?.order?._id };
        }
        return { ignored: true, reason: `verify returned ${data?.status}` };
      } catch (err) {
        return { ignored: true, reason: `verify error: ${err.message}` };
      }
    case "charge.failed":
      return markPaymentFailedFromWebhook(reference, event.data);
    default:
      return { ignored: true, reason: `unhandled event: ${event.event}` };
  }
};

module.exports = {
  initializePayment,
  verifyPaymentByReference,
  handlePaystackWebhook,
};
