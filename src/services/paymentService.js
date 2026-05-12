const crypto = require("crypto");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const User = require("../models/User");
const Counter = require("../models/Counter");
const Donation = require("../models/Donation");
const DonationContribution = require("../models/DonationContribution");
const HttpError = require("../utils/httpError");
const paystackService = require("./paystackService");
const {
  notifyOrderPlaced,
  notifyDonationReceived,
} = require("./fcmOrderNotifyService");

const appendOrderHistory = (order, status, note = "") => {
  order.orderStatusHistory = order.orderStatusHistory || [];
  order.orderStatusHistory.push({ status, at: new Date(), note });
};

const nextDonationContributionNumber = async (session) => {
  // Pipeline update + upsert: starts at 10001 on first call, increments thereafter.
  // Mongoose 9+ requires `updatePipeline: true` to accept an aggregation pipeline.
  const doc = await Counter.findOneAndUpdate(
    { _id: "donationSequence" },
    [{ $set: { seq: { $add: [{ $ifNull: ["$seq", 10000] }, 1] } } }],
    { new: true, upsert: true, session, updatePipeline: true }
  );
  return `SATYA-DON-${doc.seq}`;
};

/**
 * Resolve the final Paystack redirect URL for this transaction. Client-supplied
 * `callbackUrl` wins; otherwise we fall back to the server-wide
 * `PAYSTACK_CALLBACK_URL` env value so every payment ends up on the success page
 * the deployment is configured for.
 */
const resolveCallbackUrl = (callbackUrl) =>
  callbackUrl || process.env.PAYSTACK_CALLBACK_URL || null;

// ── ORDER: initialize ───────────────────────────────────────────────────────

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
  const resolvedCallbackUrl = resolveCallbackUrl(callbackUrl);

  const initData = await paystackService.initializeTransaction({
    email,
    amountInMajor: order.totalAmount,
    currency: order.currency,
    reference,
    callbackUrl: resolvedCallbackUrl,
    metadata: {
      kind: "ORDER",
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      userId: String(order.user),
      callbackUrl: resolvedCallbackUrl,
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
    callbackUrl: resolvedCallbackUrl,
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || null,
    amount: order.totalAmount,
    currency: order.currency,
    email,
  };
};

// ── DONATION: initialize ────────────────────────────────────────────────────

/**
 * Initialize a Paystack transaction for a donation. Creates DonationContribution +
 * Payment both in PENDING, returns the auth URL. The contribution is only
 * flipped to PAID by verifyPaymentByReference after server-side Paystack verify.
 */
const initializeDonationPayment = async (
  donationId,
  { userId, amount, currency = "ZAR", note = "", callbackUrl } = {}
) => {
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    throw new HttpError("amount must be a positive number", 400);
  }

  const donation = await Donation.findOne({
    _id: donationId,
    status: "APPROVED",
    isVisible: true,
  });
  if (!donation) throw new HttpError("Donation not found", 404);

  const user = await User.findById(userId).select("email fullName");
  const email = user?.email;
  if (!email) {
    throw new HttpError(
      "An email is required on your account to start a Paystack payment.",
      400
    );
  }

  const normalizedCurrency = String(currency || "ZAR").toUpperCase();
  const normalizedAmount = Math.round(Number(amount) * 100) / 100;
  const resolvedCallbackUrl = resolveCallbackUrl(callbackUrl);

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const contributionNumber = await nextDonationContributionNumber(session);
      const reference = `PSK-DON-${contributionNumber.replace(
        /^SATYA-DON-/,
        ""
      )}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

      const [contribution] = await DonationContribution.create(
        [
          {
            contributionNumber,
            donation: donation._id,
            user: userId,
            amount: normalizedAmount,
            currency: normalizedCurrency,
            paymentStatus: "PENDING",
            paymentMethod: "PAYSTACK",
            paystackReference: reference,
            note: note || "",
          },
        ],
        { session }
      );

      // Paystack HTTP call is intentionally inside the transaction window but
      // is the LAST step before persistence so a failed network call rolls back
      // the contribution row cleanly via abort.
      const initData = await paystackService.initializeTransaction({
        email,
        amountInMajor: normalizedAmount,
        currency: normalizedCurrency,
        reference,
        callbackUrl: resolvedCallbackUrl,
        metadata: {
          kind: "DONATION",
          donationId: String(donation._id),
          donationTitle: donation.title,
          contributionId: String(contribution._id),
          contributionNumber,
          userId: String(userId),
          callbackUrl: resolvedCallbackUrl,
        },
      });

      const [payment] = await Payment.create(
        [
          {
            user: userId,
            order: null,
            donationContribution: contribution._id,
            paymentFor: "DONATION",
            amount: normalizedAmount,
            currency: normalizedCurrency,
            gateway: "PAYSTACK",
            reference: initData.reference,
            status: "PENDING",
            response: { initialize: initData },
          },
        ],
        { session }
      );

      result = {
        paymentId: payment._id,
        contributionId: contribution._id,
        contributionNumber,
        reference: initData.reference,
        accessCode: initData.access_code,
        authorization_url: initData.authorization_url,
        authorizationUrl: initData.authorization_url,
        callbackUrl: resolvedCallbackUrl,
        publicKey: process.env.PAYSTACK_PUBLIC_KEY || null,
        amount: normalizedAmount,
        currency: normalizedCurrency,
        email,
        donation: {
          _id: donation._id,
          title: donation.title,
        },
      };
    });
  } finally {
    await session.endSession();
  }
  return result;
};

// ── ORDER: stock decrement helper ───────────────────────────────────────────

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

// ── ORDER verify path ───────────────────────────────────────────────────────

const settleOrderInTransaction = async ({
  payment,
  paystackData,
  paystackStatus,
  session,
  userId,
  isAdmin,
}) => {
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
      payment.paymentId =
        paystackData.id != null ? String(paystackData.id) : payment.paymentId;
      payment.transactionId =
        paystackData.id != null ? String(paystackData.id) : payment.transactionId;
      payment.response = { ...(payment.response || {}), verify: paystackData };
      await payment.save({ session });
    }
    return { order, payment, status: "success", alreadyPaid: true, shouldNotify: false };
  }

  if (paystackStatus === "success") {
    const expected = paystackService.toSubunit(order.totalAmount, order.currency);
    if (Number(paystackData.amount) !== expected) {
      throw new HttpError(
        `Paystack amount mismatch (expected ${expected}, got ${paystackData.amount}).`,
        409
      );
    }
    if (
      String(paystackData.currency).toUpperCase() !==
      String(order.currency).toUpperCase()
    ) {
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
    appendOrderHistory(order, order.orderStatus, `Paystack paid (ref: ${payment.reference})`);
    await order.save({ session });

    await Cart.updateOne(
      { user: order.user },
      { $set: { items: [], totalAmount: 0 } },
      { session }
    );

    return { order, payment, status: "success", alreadyPaid: false, shouldNotify: true };
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

    return { order, payment, status: paystackStatus, alreadyPaid: false, shouldNotify: false };
  }

  payment.response = { ...(payment.response || {}), verify: paystackData };
  await payment.save({ session });
  return {
    order,
    payment,
    status: paystackStatus || "unknown",
    alreadyPaid: false,
    shouldNotify: false,
  };
};

// ── DONATION verify path ────────────────────────────────────────────────────

const settleDonationInTransaction = async ({
  payment,
  paystackData,
  paystackStatus,
  session,
  userId,
  isAdmin,
}) => {
  const contribution = await DonationContribution.findById(
    payment.donationContribution
  ).session(session);
  if (!contribution) {
    throw new HttpError("Donation contribution not found for this payment", 404);
  }
  if (!isAdmin && String(contribution.user) !== String(userId)) {
    throw new HttpError("No payment record matches this reference", 404);
  }

  if (contribution.paymentStatus === "PAID") {
    if (paystackStatus === "success" && payment.status !== "SUCCESS") {
      payment.status = "SUCCESS";
      payment.paymentId =
        paystackData.id != null ? String(paystackData.id) : payment.paymentId;
      payment.transactionId =
        paystackData.id != null ? String(paystackData.id) : payment.transactionId;
      payment.response = { ...(payment.response || {}), verify: paystackData };
      await payment.save({ session });
    }
    return { contribution, payment, status: "success", alreadyPaid: true, shouldNotify: false };
  }

  if (paystackStatus === "success") {
    const expected = paystackService.toSubunit(contribution.amount, contribution.currency);
    if (Number(paystackData.amount) !== expected) {
      throw new HttpError(
        `Paystack amount mismatch (expected ${expected}, got ${paystackData.amount}).`,
        409
      );
    }
    if (
      String(paystackData.currency).toUpperCase() !==
      String(contribution.currency).toUpperCase()
    ) {
      throw new HttpError(
        `Paystack currency mismatch (expected ${contribution.currency}, got ${paystackData.currency}).`,
        409
      );
    }

    payment.status = "SUCCESS";
    payment.paymentId = paystackData.id != null ? String(paystackData.id) : null;
    payment.transactionId = paystackData.id != null ? String(paystackData.id) : null;
    payment.response = { ...(payment.response || {}), verify: paystackData };
    await payment.save({ session });

    contribution.paymentStatus = "PAID";
    contribution.transactionId =
      paystackData.id != null ? String(paystackData.id) : null;
    await contribution.save({ session });

    return { contribution, payment, status: "success", alreadyPaid: false, shouldNotify: true };
  }

  if (paystackStatus === "abandoned" || paystackStatus === "failed") {
    payment.status = "FAILED";
    payment.response = { ...(payment.response || {}), verify: paystackData };
    await payment.save({ session });

    if (contribution.paymentStatus !== "PAID") {
      contribution.paymentStatus = "FAILED";
      await contribution.save({ session });
    }

    return {
      contribution,
      payment,
      status: paystackStatus,
      alreadyPaid: false,
      shouldNotify: false,
    };
  }

  payment.response = { ...(payment.response || {}), verify: paystackData };
  await payment.save({ session });
  return {
    contribution,
    payment,
    status: paystackStatus || "unknown",
    alreadyPaid: false,
    shouldNotify: false,
  };
};

// ── Verify dispatcher ───────────────────────────────────────────────────────

/**
 * Server-side verify by Paystack reference. Idempotent for both ORDER and
 * DONATION payments. Paystack is called first; MongoDB transaction handles the
 * domain-specific settlement.
 */
const verifyPaymentByReference = async (reference, { userId, isAdmin = false } = {}) => {
  if (!reference) throw new HttpError("reference is required", 400);

  const paystackData = await paystackService.verifyTransaction(reference);
  const paystackStatus = paystackData?.status;

  const session = await mongoose.startSession();
  let out;
  let shouldNotify = false;
  let kind;

  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findOne({
        reference,
        isDeleted: { $ne: true },
      }).session(session);
      if (!payment) {
        throw new HttpError("No payment record matches this reference", 404);
      }
      kind = payment.paymentFor;

      if (payment.paymentFor === "DONATION") {
        const r = await settleDonationInTransaction({
          payment,
          paystackData,
          paystackStatus,
          session,
          userId,
          isAdmin,
        });
        shouldNotify = r.shouldNotify;
        out = {
          payment: r.payment,
          contribution: r.contribution,
          status: r.status,
          alreadyPaid: r.alreadyPaid,
        };
        return;
      }

      // Default / ORDER path
      const r = await settleOrderInTransaction({
        payment,
        paystackData,
        paystackStatus,
        session,
        userId,
        isAdmin,
      });
      shouldNotify = r.shouldNotify;
      out = {
        payment: r.payment,
        order: r.order,
        status: r.status,
        alreadyPaid: r.alreadyPaid,
      };
    });
  } finally {
    await session.endSession();
  }

  if (shouldNotify) {
    if (kind === "DONATION") {
      await notifyDonationReceived(out.contribution.user, {
        amount: out.contribution.amount,
        currency: out.contribution.currency,
        contributionId: out.contribution._id,
      });
    } else {
      await notifyOrderPlaced(out.order.user);
    }
  }

  return out;
};

// ── Webhook ────────────────────────────────────────────────────────────────

const markPaymentFailedFromWebhook = async (reference, eventData) => {
  const payment = await Payment.findOne({ reference, isDeleted: { $ne: true } });
  if (!payment) return { ignored: true, reason: "no matching payment" };
  if (payment.status === "SUCCESS") {
    return { ignored: true, reason: "payment already successful" };
  }

  payment.status = "FAILED";
  payment.response = { ...(payment.response || {}), webhook: eventData };
  await payment.save();

  if (payment.paymentFor === "DONATION" && payment.donationContribution) {
    const contribution = await DonationContribution.findById(
      payment.donationContribution
    );
    if (contribution && contribution.paymentStatus === "PENDING") {
      contribution.paymentStatus = "FAILED";
      await contribution.save();
    }
    return {
      processed: true,
      status: "failed",
      contributionId: contribution?._id,
    };
  }

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
          return {
            processed: true,
            status: result?.status,
            orderId: result?.order?._id,
            contributionId: result?.contribution?._id,
          };
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
  initializeDonationPayment,
  verifyPaymentByReference,
  handlePaystackWebhook,
};
