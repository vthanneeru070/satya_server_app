const crypto = require("crypto");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const User = require("../models/User");
const Counter = require("../models/Counter");
const DonationContribution = require("../models/DonationContribution");
const HttpError = require("../utils/httpError");
const paystackService = require("./paystackService");
const payfastService = require("./payfastService");
const {
  notifyOrderPlaced,
  notifyDonationReceived,
  notifyRefundProcessed,
} = require("./fcmOrderNotifyService");
const invoiceService = require("./invoiceService");
const orderEmailService = require("./orderEmailService");
const adminNotificationService = require("./adminNotificationService");

const appendOrderHistory = (order, status, note = "") => {
  order.orderStatusHistory = order.orderStatusHistory || [];
  order.orderStatusHistory.push({ status, at: new Date(), note });
};

/** Resolve ORDER vs DONATION even when legacy rows omit paymentFor. */
const resolvePaymentKind = (payment) => {
  if (!payment) return null;
  const explicit = String(payment.paymentFor || "").toUpperCase();
  if (explicit === "DONATION" || explicit === "ORDER") return explicit;
  if (payment.donationContribution) return "DONATION";
  if (payment.order) return "ORDER";
  return "ORDER";
};

const nextDonationContributionNumber = async (session) => {
  // Pipeline update + upsert: starts at 10001 on first call, increments thereafter.
  // Mongoose 9+ requires `updatePipeline: true` to accept an aggregation pipeline.
  const doc = await Counter.findOneAndUpdate(
    { _id: "donationSequence" },
    [{ $set: { seq: { $add: [{ $ifNull: ["$seq", 10000] }, 1] } } }],
    { new: true, upsert: true, session, updatePipeline: true }
  );
  return `SATHYA-DON-${doc.seq}`;
};

/**
 * Resolve the PayFast return URL for this transaction. Client-supplied
 * `callbackUrl` wins; otherwise we fall back to PAYFAST_RETURN_URL or the legacy
 * PAYSTACK_CALLBACK_URL env value.
 */
const resolveReturnUrl = (callbackUrl) => {
  const { returnUrl } = payfastService.readConfig();
  return callbackUrl || returnUrl || null;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** If verify body includes PayFast ITN/return fields, build an ITN payload. */
const extractPayfastItnFromVerifyPayload = (payload = {}, reference) => {
  if (!payload || typeof payload !== "object") return null;
  const {
    reference: _ref,
    callbackUrl: _cb,
    orderId: _orderId,
    ...rest
  } = payload;
  const hasItnFields =
    rest.payment_status ||
    rest.pf_payment_id ||
    rest.signature ||
    rest.amount_gross;
  if (!hasItnFields) return null;
  return {
    ...rest,
    m_payment_id: rest.m_payment_id || reference,
  };
};

const buildPayfastVerifyResult = async (payment, kind) => {
  if (payment.status === "SUCCESS") {
    return kind === "DONATION"
      ? {
          payment,
          contribution: await DonationContribution.findById(payment.donationContribution),
          status: "success",
          alreadyPaid: true,
        }
      : {
          payment,
          order: await Order.findById(payment.order),
          status: "success",
          alreadyPaid: true,
        };
  }
  if (payment.status === "FAILED") {
    return kind === "DONATION"
      ? {
          payment,
          contribution: await DonationContribution.findById(payment.donationContribution),
          status: "failed",
          alreadyPaid: false,
        }
      : {
          payment,
          order: await Order.findById(payment.order),
          status: "failed",
          alreadyPaid: false,
        };
  }
  return kind === "DONATION"
    ? {
        payment,
        contribution: await DonationContribution.findById(payment.donationContribution),
        status: "pending",
        alreadyPaid: false,
        pendingReason:
          "Awaiting PayFast ITN. Confirm PAYFAST_NOTIFY_URL is registered in PayFast and reachable.",
      }
    : {
        payment,
        order: await Order.findById(payment.order),
        status: "pending",
        alreadyPaid: false,
        pendingReason:
          "Awaiting PayFast ITN. Confirm PAYFAST_NOTIFY_URL is registered in PayFast and reachable.",
      };
};

/** Normalize Paystack verify payload or PayFast ITN into a common settlement shape. */
const normalizeGatewayData = (gateway, rawData) => {
  if (gateway === "PAYFAST") {
    const normalized =
      rawData?.status && rawData?.amountMajor != null
        ? rawData
        : payfastService.normalizeItnPayload(rawData);
    return {
      status: normalized.status,
      amountMajor: Number(normalized.amountMajor),
      currency: String(normalized.currency || "ZAR").toUpperCase(),
      transactionId: normalized.id,
      reference: normalized.reference,
      raw: normalized.raw || rawData,
    };
  }

  const paystackStatus = rawData?.status;
  return {
    status: paystackStatus,
    amountMajor: paystackService.fromSubunit(rawData?.amount, rawData?.currency),
    currency: String(rawData?.currency || "ZAR").toUpperCase(),
    transactionId: rawData?.id != null ? String(rawData.id) : null,
    reference: rawData?.reference || null,
    raw: rawData,
  };
};

// ── ORDER: initialize ───────────────────────────────────────────────────────

/**
 * Initialize PayFast for an order; persists Payment (PENDING) + order.paystackReference.
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
  if (["REFUNDED", "REFUND_INITIATED", "REFUND_FAILED"].includes(order.paymentStatus)) {
    throw new HttpError(
      "This order cannot accept a new payment (refund in progress or completed).",
      400
    );
  }
  if (["DELIVERED", "CANCELLED"].includes(order.orderStatus)) {
    throw new HttpError(`Order is ${order.orderStatus} and cannot be paid for.`, 400);
  }

  const user = await User.findById(order.user).select("email fullName");
  const email = user?.email;
  if (!email) {
    throw new HttpError(
      "An email is required on the user account to start a PayFast payment.",
      400
    );
  }

  const reference = `PF-${order.orderNumber}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const resolvedReturnUrl = resolveReturnUrl(callbackUrl);
  const nameParts = String(user?.fullName || "").trim().split(/\s+/);
  const nameFirst = nameParts[0] || "";
  const nameLast = nameParts.slice(1).join(" ") || "";

  const initData = await payfastService.initializeTransaction({
    email,
    amountInMajor: order.totalAmount,
    currency: order.currency,
    reference,
    returnUrl: resolvedReturnUrl,
    itemName: `Order ${order.orderNumber}`,
    itemDescription: `Sathya order ${order.orderNumber}`,
    nameFirst,
    nameLast,
    metadata: {
      kind: "ORDER",
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      userId: String(order.user),
      callbackUrl: resolvedReturnUrl,
    },
  });

  const payment = await Payment.create({
    user: order.user,
    order: order._id,
    paymentFor: "ORDER",
    amount: order.totalAmount,
    currency: order.currency,
    gateway: "PAYFAST",
    reference: initData.reference,
    status: "PENDING",
    response: { initialize: initData },
  });

  order.paymentMethod = "PAYFAST";
  order.paystackReference = initData.reference;
  await order.save();

  return {
    paymentId: payment._id,
    reference: initData.reference,
    paymentUrl: initData.paymentUrl,
    formFields: initData.formFields,
    method: initData.method,
    authorization_url: initData.authorization_url,
    authorizationUrl: initData.authorizationUrl,
    callbackUrl: resolvedReturnUrl,
    returnUrl: initData.returnUrl,
    cancelUrl: initData.cancelUrl,
    amount: order.totalAmount,
    currency: order.currency,
    email,
  };
};

// ── DONATION: initialize ────────────────────────────────────────────────────

/**
 * Initialize a PayFast transaction for a donation. Creates DonationContribution +
 * Payment both in PENDING, returns the checkout URL / form fields. The contribution
 * is only flipped to PAID after ITN or server-side verify confirms settlement.
 */
const initializeDonationPayment = async ({
  userId,
  amount,
  currency = "ZAR",
  note = "",
  callbackUrl,
} = {}) => {
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    throw new HttpError("amount must be a positive number", 400);
  }

  const user = await User.findById(userId).select("email fullName");
  const email = user?.email;
  if (!email) {
    throw new HttpError(
      "An email is required on your account to start a PayFast payment.",
      400
    );
  }

  const normalizedCurrency = String(currency || "ZAR").toUpperCase();
  const normalizedAmount = Math.round(Number(amount) * 100) / 100;
  const resolvedReturnUrl = resolveReturnUrl(callbackUrl);
  const nameParts = String(user?.fullName || "").trim().split(/\s+/);
  const nameFirst = nameParts[0] || "";
  const nameLast = nameParts.slice(1).join(" ") || "";

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const contributionNumber = await nextDonationContributionNumber(session);
      const reference = `PF-DON-${contributionNumber.replace(
        /^SATHYA-DON-/,
        ""
      )}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

      const [contribution] = await DonationContribution.create(
        [
          {
            contributionNumber,
            user: userId,
            amount: normalizedAmount,
            currency: normalizedCurrency,
            paymentStatus: "PENDING",
            paymentMethod: "PAYFAST",
            paystackReference: reference,
            note: note || "",
          },
        ],
        { session }
      );

      const initData = await payfastService.initializeTransaction({
        email,
        amountInMajor: normalizedAmount,
        currency: normalizedCurrency,
        reference,
        returnUrl: resolvedReturnUrl,
        itemName: `Donation ${contributionNumber}`,
        itemDescription: note
          ? `Sathya donation · ${contributionNumber} · ${String(note).slice(0, 180)}`
          : `Sathya donation · ${contributionNumber}`,
        nameFirst,
        nameLast,
        metadata: {
          kind: "DONATION",
          contributionId: String(contribution._id),
          contributionNumber,
          userId: String(userId),
          callbackUrl: resolvedReturnUrl,
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
            gateway: "PAYFAST",
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
        paymentUrl: initData.paymentUrl,
        formFields: initData.formFields,
        method: initData.method,
        authorization_url: initData.authorization_url,
        authorizationUrl: initData.authorizationUrl,
        callbackUrl: resolvedReturnUrl,
        returnUrl: initData.returnUrl,
        cancelUrl: initData.cancelUrl,
        amount: normalizedAmount,
        currency: normalizedCurrency,
        email,
      };
    });
  } finally {
    await session.endSession();
  }
  return result;
};

// ── ORDER: stock decrement helper ───────────────────────────────────────────

const applyStockDecrement = async (order, session) => {
  const orderService = require("./orderService");
  await orderService._internal.applyStockDeductionForOrder(order, session);
};

// ── ORDER verify path ───────────────────────────────────────────────────────

const settleOrderInTransaction = async ({
  payment,
  gatewayData,
  gatewayStatus,
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
    if (gatewayStatus === "success" && payment.status !== "SUCCESS") {
      payment.status = "SUCCESS";
      payment.paymentId =
        gatewayData.transactionId != null ? String(gatewayData.transactionId) : payment.paymentId;
      payment.transactionId =
        gatewayData.transactionId != null ? String(gatewayData.transactionId) : payment.transactionId;
      payment.response = { ...(payment.response || {}), verify: gatewayData.raw };
      await payment.save({ session });
    }
    return { order, payment, status: "success", alreadyPaid: true, shouldNotify: false };
  }

  if (["REFUNDED", "REFUND_INITIATED", "REFUND_FAILED"].includes(order.paymentStatus)) {
    if (gatewayStatus === "success") {
      if (payment.status !== "SUCCESS") {
        payment.status = "SUCCESS";
        payment.paymentId =
          gatewayData.transactionId != null ? String(gatewayData.transactionId) : payment.paymentId;
        payment.transactionId =
          gatewayData.transactionId != null ? String(gatewayData.transactionId) : payment.transactionId;
        payment.response = { ...(payment.response || {}), verify: gatewayData.raw };
        await payment.save({ session });
      }
    }
    return { order, payment, status: "success", alreadyPaid: true, shouldNotify: false };
  }
  if (gatewayStatus === "success") {
    const expected = Number(order.totalAmount);
    if (Math.abs(Number(gatewayData.amountMajor) - expected) > 0.01) {
      throw new HttpError(
        `Payment amount mismatch (expected ${expected}, got ${gatewayData.amountMajor}).`,
        409
      );
    }
    if (
      String(gatewayData.currency).toUpperCase() !==
      String(order.currency).toUpperCase()
    ) {
      throw new HttpError(
        `Payment currency mismatch (expected ${order.currency}, got ${gatewayData.currency}).`,
        409
      );
    }

    await applyStockDecrement(order, session);

    payment.status = "SUCCESS";
    payment.paymentId =
      gatewayData.transactionId != null ? String(gatewayData.transactionId) : null;
    payment.transactionId =
      gatewayData.transactionId != null ? String(gatewayData.transactionId) : null;
    payment.response = { ...(payment.response || {}), verify: gatewayData.raw };
    await payment.save({ session });

    order.paymentStatus = "PAID";
    order.transactionId =
      gatewayData.transactionId != null ? String(gatewayData.transactionId) : null;
    order.inventoryReserved = true;
    appendOrderHistory(order, order.orderStatus, `PayFast paid (ref: ${payment.reference})`);
    await order.save({ session });

    await Cart.updateOne(
      { user: order.user },
      { $set: { items: [], totalAmount: 0 } },
      { session }
    );

    return { order, payment, status: "success", alreadyPaid: false, shouldNotify: true };
  }

  if (gatewayStatus === "cancelled" || gatewayStatus === "abandoned" || gatewayStatus === "failed") {
    payment.status = "FAILED";
    payment.response = { ...(payment.response || {}), verify: gatewayData.raw };
    await payment.save({ session });

    if (order.paymentStatus === "PENDING" || order.paymentStatus === "FAILED") {
      order.paymentStatus = "FAILED";
      appendOrderHistory(order, order.orderStatus, `PayFast payment ${gatewayStatus}`);
      await order.save({ session });
    }

    return { order, payment, status: gatewayStatus, alreadyPaid: false, shouldNotify: false };
  }

  payment.response = { ...(payment.response || {}), verify: gatewayData.raw };
  await payment.save({ session });
  return {
    order,
    payment,
    status: gatewayStatus || "unknown",
    alreadyPaid: false,
    shouldNotify: false,
  };
};

// ── DONATION verify path ────────────────────────────────────────────────────

const settleDonationInTransaction = async ({
  payment,
  gatewayData,
  gatewayStatus,
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
    if (gatewayStatus === "success" && payment.status !== "SUCCESS") {
      payment.status = "SUCCESS";
      payment.paymentId =
        gatewayData.transactionId != null ? String(gatewayData.transactionId) : payment.paymentId;
      payment.transactionId =
        gatewayData.transactionId != null ? String(gatewayData.transactionId) : payment.transactionId;
      payment.response = { ...(payment.response || {}), verify: gatewayData.raw };
      await payment.save({ session });
    }
    return { contribution, payment, status: "success", alreadyPaid: true, shouldNotify: false };
  }

  if (gatewayStatus === "success") {
    const expected = Number(contribution.amount);
    if (Math.abs(Number(gatewayData.amountMajor) - expected) > 0.01) {
      throw new HttpError(
        `Payment amount mismatch (expected ${expected}, got ${gatewayData.amountMajor}).`,
        409
      );
    }
    if (
      String(gatewayData.currency).toUpperCase() !==
      String(contribution.currency).toUpperCase()
    ) {
      throw new HttpError(
        `Payment currency mismatch (expected ${contribution.currency}, got ${gatewayData.currency}).`,
        409
      );
    }

    payment.status = "SUCCESS";
    payment.paymentId =
      gatewayData.transactionId != null ? String(gatewayData.transactionId) : null;
    payment.transactionId =
      gatewayData.transactionId != null ? String(gatewayData.transactionId) : null;
    payment.response = { ...(payment.response || {}), verify: gatewayData.raw };
    await payment.save({ session });

    contribution.paymentStatus = "PAID";
    contribution.transactionId =
      gatewayData.transactionId != null ? String(gatewayData.transactionId) : null;
    await contribution.save({ session });

    return { contribution, payment, status: "success", alreadyPaid: false, shouldNotify: true };
  }

  if (gatewayStatus === "cancelled" || gatewayStatus === "abandoned" || gatewayStatus === "failed") {
    payment.status = "FAILED";
    payment.response = { ...(payment.response || {}), verify: gatewayData.raw };
    await payment.save({ session });

    if (contribution.paymentStatus !== "PAID") {
      contribution.paymentStatus = "FAILED";
      await contribution.save({ session });
    }

    return {
      contribution,
      payment,
      status: gatewayStatus,
      alreadyPaid: false,
      shouldNotify: false,
    };
  }

  payment.response = { ...(payment.response || {}), verify: gatewayData.raw };
  await payment.save({ session });
  return {
    contribution,
    payment,
    status: gatewayStatus || "unknown",
    alreadyPaid: false,
    shouldNotify: false,
  };
};

// ── Verify dispatcher ───────────────────────────────────────────────────────

/**
 * Shared settlement path used by verify + ITN. Runs notifications after commit.
 */
const finalizeVerifiedPayment = async (out, { shouldNotify, kind, reference }) => {
  const paymentKind = kind || (out?.contribution ? "DONATION" : "ORDER");
  const donationPaid =
    out?.contribution &&
    out.contribution.paymentStatus === "PAID" &&
    out.status === "success";

  if (donationPaid) {
    if (shouldNotify) {
      await notifyDonationReceived(out.contribution.user, {
        amount: out.contribution.amount,
        currency: out.contribution.currency,
        contributionId: out.contribution._id,
      });
    }
    const contribution =
      (await DonationContribution.findById(out.contribution._id)
        .populate("donation", "title")
        .lean()) || out.contribution;
    await adminNotificationService
      .notifyPaymentSuccessForDonation(contribution, { pushFcm: shouldNotify })
      .catch((err) =>
        console.error(
          "[paymentService] admin PAYMENT_SUCCESS notification failed:",
          err?.message || err
        )
      );
  } else if (shouldNotify) {
    if (paymentKind === "DONATION") {
      console.warn(
        "[paymentService] donation verify succeeded but contribution is not PAID — skipping admin notify",
        { reference, status: out?.status }
      );
    } else {
      await notifyOrderPlaced(out.order.user, { order: out.order });

      try {
        const inv = await invoiceService.generateInvoice(out.order);
        if (inv?.number || inv?.url) {
          out.order.invoice = {
            number: inv.number || "",
            url: inv.url || "",
            generatedAt: new Date(),
          };
          await out.order.save();
        }
      } catch (err) {
        console.error(
          "[paymentService] invoice generation failed for order",
          out.order?.orderNumber,
          err?.message || err
        );
      }

      await orderEmailService
        .sendOrderConfirmation(out.order)
        .catch((err) =>
          console.error(
            "[paymentService] sendOrderConfirmation failed:",
            err?.message || err
          )
        );
      await orderEmailService
        .sendOrderAdminNotification(out.order)
        .catch((err) =>
          console.error(
            "[paymentService] sendOrderAdminNotification failed:",
            err?.message || err
          )
        );
      await adminNotificationService.notifyNewOrder(out.order).catch((err) =>
        console.error(
          "[paymentService] admin NEW_ORDER notification failed:",
          err?.message || err
        )
      );
    }
  }

  return out;
};

const settlePaymentInTransaction = async ({
  payment,
  gatewayData,
  gatewayStatus,
  session,
  userId,
  isAdmin,
}) => {
  const kind = resolvePaymentKind(payment);
  if (kind === "DONATION") {
    return settleDonationInTransaction({
      payment,
      gatewayData,
      gatewayStatus,
      session,
      userId,
      isAdmin,
    });
  }
  return settleOrderInTransaction({
    payment,
    gatewayData,
    gatewayStatus,
    session,
    userId,
    isAdmin,
  });
};

/**
 * Server-side verify by payment reference. Idempotent for both ORDER and
 * DONATION payments.
 *
 * PayFast:
 *   1. Process ITN/return payload when the client includes PayFast fields (validates
 *      with PayFast eng/query/validate — not DB-only).
 *   2. Poll local DB briefly for ITN settlement.
 *   3. If still pending, query PayFast Transaction History API (merchant dashboard
 *      data) by m_payment_id and settle when found.
 */
const verifyPaymentByReference = async (
  reference,
  { userId, isAdmin = false, payfastNotify = null, waitForItnMs = 12000 } = {}
) => {
  if (!reference) throw new HttpError("reference is required", 400);

  let payment = await Payment.findOne({
    reference,
    isDeleted: { $ne: true },
  });
  if (!payment) {
    throw new HttpError("No payment record matches this reference", 404);
  }

  const kind = resolvePaymentKind(payment);

  if (payment.gateway === "PAYFAST") {
    if (payfastNotify && typeof payfastNotify === "object") {
      await handlePayfastItn(payfastNotify);
      payment = await Payment.findOne({ reference, isDeleted: { $ne: true } });
    }

    const pollUntil = Date.now() + Math.max(Number(waitForItnMs) || 0, 0);
    while (
      payment &&
      payment.status === "PENDING" &&
      Date.now() < pollUntil
    ) {
      await sleep(1000);
      payment = await Payment.findOne({ reference, isDeleted: { $ne: true } });
    }

    if (!payment) {
      throw new HttpError("No payment record matches this reference", 404);
    }

    if (payment.status === "PENDING") {
      try {
        const lookup = await payfastService.lookupTransactionByMerchantPaymentId(
          reference,
          {
            fromDate: payment.createdAt,
            expectedAmountMajor: payment.amount,
          }
        );

        if (lookup.found && lookup.status === "success") {
          const gatewayData = normalizeGatewayData("PAYFAST", lookup.data);
          const gatewayStatus = gatewayData.status;

          const session = await mongoose.startSession();
          let out;
          let shouldNotify = false;

          try {
            await session.withTransaction(async () => {
              const lockedPayment = await Payment.findOne({
                reference,
                isDeleted: { $ne: true },
              }).session(session);
              if (!lockedPayment) {
                throw new HttpError("No payment record matches this reference", 404);
              }

              lockedPayment.response = {
                ...(lockedPayment.response || {}),
                payfastHistoryLookup: lookup.row,
              };

              const r = await settlePaymentInTransaction({
                payment: lockedPayment,
                gatewayData,
                gatewayStatus,
                session,
                userId,
                isAdmin,
              });
              shouldNotify = r.shouldNotify;
              if (kind === "DONATION") {
                out = {
                  payment: r.payment,
                  contribution: r.contribution,
                  status: r.status,
                  alreadyPaid: r.alreadyPaid,
                  verifiedVia: "payfast-transaction-history",
                };
              } else {
                out = {
                  payment: r.payment,
                  order: r.order,
                  status: r.status,
                  alreadyPaid: r.alreadyPaid,
                  verifiedVia: "payfast-transaction-history",
                };
              }
            });
          } finally {
            await session.endSession();
          }

          return finalizeVerifiedPayment(out, { shouldNotify, kind, reference });
        }
      } catch (err) {
        console.warn(
          "[paymentService] PayFast transaction-history verify failed:",
          err?.message || err
        );
      }
    }

    return buildPayfastVerifyResult(payment, kind);
  }

  const paystackData = await paystackService.verifyTransaction(reference);
  const gatewayData = normalizeGatewayData("PAYSTACK", paystackData);
  const gatewayStatus = gatewayData.status;

  const session = await mongoose.startSession();
  let out;
  let shouldNotify = false;

  try {
    await session.withTransaction(async () => {
      const lockedPayment = await Payment.findOne({
        reference,
        isDeleted: { $ne: true },
      }).session(session);
      if (!lockedPayment) {
        throw new HttpError("No payment record matches this reference", 404);
      }

      const r = await settlePaymentInTransaction({
        payment: lockedPayment,
        gatewayData,
        gatewayStatus,
        session,
        userId,
        isAdmin,
      });
      shouldNotify = r.shouldNotify;
      if (kind === "DONATION") {
        out = {
          payment: r.payment,
          contribution: r.contribution,
          status: r.status,
          alreadyPaid: r.alreadyPaid,
        };
      } else {
        out = {
          payment: r.payment,
          order: r.order,
          status: r.status,
          alreadyPaid: r.alreadyPaid,
        };
      }
    });
  } finally {
    await session.endSession();
  }

  return finalizeVerifiedPayment(out, { shouldNotify, kind, reference });
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
 * Reconcile a Paystack refund.processed / refund.failed event with our Order.
 * Paystack refund webhooks carry `data.transaction.reference` (NOT `data.reference`).
 */
const handleRefundWebhook = async (event) => {
  const data = event?.data || {};
  const reference =
    data.transaction?.reference || data.reference || data.transaction_reference;
  if (!reference) {
    return { ignored: true, reason: "refund webhook missing transaction reference" };
  }

  const order = await Order.findOne({
    paystackReference: reference,
    isDeleted: { $ne: true },
  });
  if (!order) {
    return { ignored: true, reason: "no order matches refund reference" };
  }

  order.refund = order.refund || {};
  const refundId = data.id != null ? String(data.id) : order.refund.paystackRefundId || "";

  if (event.event === "refund.processed") {
    // Capture prior state so we can suppress duplicate notifications when
    // the synchronous admin-cancel path already marked PROCESSED + emailed.
    const wasAlreadyProcessed = order.refund.status === "PROCESSED";

    order.refund.status = "PROCESSED";
    order.refund.paystackRefundId = refundId;
    if (!order.refund.processedAt) order.refund.processedAt = new Date();
    order.refund.lastError = "";
    if (["PAID", "REFUND_INITIATED", "REFUND_FAILED"].includes(order.paymentStatus)) {
      order.paymentStatus = "REFUNDED";
    }
    appendOrderHistory(
      order,
      order.orderStatus,
      `Paystack refund processed (${refundId}) | paymentStatus: ${order.paymentStatus} | refund.status: ${order.refund.status}`
    );
    await order.save();

    // Best-effort customer notifications, but only if we didn't already tell
    // them in the synchronous admin-cancel path. We never fail the webhook on these.
    if (!wasAlreadyProcessed) {
      try {
        await orderEmailService.sendRefundProcessed(order);
      } catch (err) {
        console.warn(
          "[paystack] refund.processed email failed:",
          err?.message || err
        );
      }
      try {
        await notifyRefundProcessed(order.user, { order });
      } catch (err) {
        console.warn(
          "[paystack] refund.processed push failed:",
          err?.message || err
        );
      }
    } else {
      console.log(
        `[paystack] refund.processed for order ${order.orderNumber}: customer already notified via sync admin-cancel; skipping duplicate email/push.`
      );
    }

    return { processed: true, status: "refund-processed", orderId: order._id };
  }

  if (event.event === "refund.failed") {
    order.refund.status = "FAILED";
    order.refund.paystackRefundId = refundId;
    order.refund.lastError = String(
      data.reason || data.message || "Paystack reported refund.failed"
    ).slice(0, 500);
    if (order.paymentStatus === "REFUND_INITIATED" || order.paymentStatus === "PAID") {
      order.paymentStatus = "REFUND_FAILED";
    }
    appendOrderHistory(
      order,
      order.orderStatus,
      `Paystack refund FAILED (${refundId}): ${order.refund.lastError} | paymentStatus: ${order.paymentStatus} | refund.status: ${order.refund.status}`
    );
    await order.save();
    return { processed: true, status: "refund-failed", orderId: order._id };
  }

  return { ignored: true, reason: `unhandled refund event: ${event.event}` };
};

/**
 * PayFast ITN (Instant Transaction Notification) handler.
 * PayFast retries until it receives HTTP 200.
 */
const handlePayfastItn = async (
  posted,
  { itnEntries = null, itnParamString = null } = {}
) => {
  const reference = posted?.m_payment_id;
  if (!reference) {
    return { ignored: true, reason: "no m_payment_id in ITN payload" };
  }

  const payment = await Payment.findOne({ reference, isDeleted: { $ne: true } });
  if (!payment) {
    return { ignored: true, reason: "no matching payment" };
  }
  if (payment.gateway !== "PAYFAST") {
    return { ignored: true, reason: "payment is not a PayFast transaction" };
  }

  const itnResult = await payfastService.processItnNotification(posted, {
    expectedAmountMajor: payment.amount,
    orderedEntries: itnEntries,
    paramString: itnParamString,
  });
  if (!itnResult.valid) {
    console.warn("[payfast] ITN rejected:", itnResult.reason, reference);
    return { ignored: true, reason: itnResult.reason };
  }

  const gatewayData = itnResult.data;
  const gatewayStatus = gatewayData.status;

  if (gatewayStatus !== "success") {
    return markPaymentFailedFromWebhook(reference, posted);
  }

  if (payment.status === "SUCCESS") {
    return { processed: true, status: "success", alreadyPaid: true };
  }

  const session = await mongoose.startSession();
  let out;
  let shouldNotify = false;
  const kind = resolvePaymentKind(payment);

  try {
    await session.withTransaction(async () => {
      const lockedPayment = await Payment.findOne({
        reference,
        isDeleted: { $ne: true },
      }).session(session);
      if (!lockedPayment) {
        throw new HttpError("No payment record matches this reference", 404);
      }

      lockedPayment.response = {
        ...(lockedPayment.response || {}),
        itn: posted,
      };

      const r = await settlePaymentInTransaction({
        payment: lockedPayment,
        gatewayData,
        gatewayStatus,
        session,
        userId: String(lockedPayment.user),
        isAdmin: true,
      });
      shouldNotify = r.shouldNotify;
      if (kind === "DONATION") {
        out = {
          payment: r.payment,
          contribution: r.contribution,
          status: r.status,
          alreadyPaid: r.alreadyPaid,
        };
      } else {
        out = {
          payment: r.payment,
          order: r.order,
          status: r.status,
          alreadyPaid: r.alreadyPaid,
        };
      }
    });
  } finally {
    await session.endSession();
  }

  await finalizeVerifiedPayment(out, { shouldNotify, kind, reference });

  return {
    processed: true,
    status: out?.status,
    orderId: out?.order?._id,
    contributionId: out?.contribution?._id,
  };
};

const handlePaystackWebhook = async (event) => {
  if (!event || typeof event !== "object") return { ignored: true };

  // Refund events don't carry a top-level `data.reference`; route them first.
  if (event.event === "refund.processed" || event.event === "refund.failed") {
    return handleRefundWebhook(event);
  }

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

const listAllPayments = async (query = {}) => {
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  const filter = { isDeleted: { $ne: true } };

  const search = String(query.search || query.reference || "").trim();
  if (search) {
    filter.reference = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  }
  if (query.status) filter.status = query.status;
  if (query.paymentFor) filter.paymentFor = query.paymentFor;
  if (query.gateway) filter.gateway = query.gateway;
  if (query.user) filter.user = query.user;
  if (query.order) filter.order = query.order;

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "fullName email phone role")
      .populate("order", "orderNumber orderStatus paymentStatus totalAmount currency")
      .populate("donationContribution", "contributionNumber paymentStatus amount currency donation")
      .lean(),
    Payment.countDocuments(filter),
  ]);

  return {
    payments,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

module.exports = {
  initializePayment,
  initializeDonationPayment,
  verifyPaymentByReference,
  extractPayfastItnFromVerifyPayload,
  handlePaystackWebhook,
  handlePayfastItn,
  listAllPayments,
};
