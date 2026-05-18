const admin = require("../config/firebase");
const User = require("../models/User");
const { recordInboxNotification } = require("./userNotificationService");

/**
 * Firebase error codes that mean the token is dead and should be removed:
 *   https://firebase.google.com/docs/cloud-messaging/send-message#admin
 */
const INVALID_TOKEN_ERRORS = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/invalid-argument",
]);

const toFcmData = (data = {}) =>
  Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v == null ? "" : String(v)])
  );

/**
 * Internal: send a multicast push to all of a user's tokens, log what
 * happened, and auto-prune any tokens FCM tells us are dead.
 */
const dispatchPush = async (
  userId,
  { tokens, notification, data, logTag }
) => {
  if (!tokens.length) {
    console.warn(
      `[fcm] ${logTag}: user ${userId} has 0 FCM tokens registered — skipping push.`
    );
    return { sent: 0, failed: 0, pruned: 0 };
  }

  let response;
  try {
    response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification,
      data: toFcmData(data),
      android: {
        priority: "high",
        notification: {
          channelId: "satya_default",
          sound: "default",
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        headers: { "apns-priority": "10" },
        payload: {
          aps: {
            sound: "default",
            contentAvailable: true,
            mutableContent: true,
          },
        },
      },
    });
  } catch (err) {
    console.error(
      `[fcm] ${logTag}: send threw for user ${userId}:`,
      err?.message || err
    );
    return { sent: 0, failed: tokens.length, pruned: 0 };
  }

  const deadTokens = [];
  response.responses.forEach((r, idx) => {
    if (!r.success) {
      const code = r.error?.code || "unknown";
      console.warn(
        `[fcm] ${logTag}: token ${idx} failed (${code}): ${r.error?.message}`
      );
      if (INVALID_TOKEN_ERRORS.has(code)) deadTokens.push(tokens[idx]);
    }
  });

  if (deadTokens.length) {
    await User.updateOne(
      { _id: userId },
      { $pull: { fcmTokens: { $in: deadTokens } } }
    ).catch((err) =>
      console.warn(
        `[fcm] ${logTag}: failed to prune ${deadTokens.length} dead tokens:`,
        err?.message || err
      )
    );
  }

  console.log(
    `[fcm] ${logTag}: user ${userId} sent=${response.successCount} failed=${response.failureCount} pruned=${deadTokens.length}`
  );
  return {
    sent: response.successCount,
    failed: response.failureCount,
    pruned: deadTokens.length,
  };
};

const pushWithInbox = async (
  userId,
  { notification, data, sourceKey, logTag }
) => {
  await recordInboxNotification(userId, {
    title: notification.title,
    body: notification.body,
    type: data.type,
    data,
    sourceKey,
  });

  const user = await User.findById(userId).select("fcmTokens").lean();
  const tokens = [...new Set((user?.fcmTokens || []).filter(Boolean))];
  return dispatchPush(userId, { tokens, notification, data, logTag });
};

/**
 * Best-effort FCM push after order payment. Does not throw — failures are logged only.
 */
const notifyOrderPlaced = async (
  userId,
  {
    order,
    title = "Order confirmed",
    body = "Your order has been placed successfully",
  } = {}
) => {
  try {
    if (!userId) return { sent: 0, failed: 0, pruned: 0 };

    const orderId = order?._id;
    const orderNumber = order?.orderNumber || "";
    const finalBody =
      body ||
      (orderNumber
        ? `Order ${orderNumber} has been placed successfully.`
        : "Your order has been placed successfully.");

    const data = {
      type: "ORDER_PLACED",
      userId: String(userId),
      orderId: orderId ? String(orderId) : "",
      orderNumber: String(orderNumber),
    };

    const sourceKey = orderId
      ? `order:${orderId}:PLACED`
      : `order:placed:${userId}:${Date.now()}`;

    return pushWithInbox(userId, {
      notification: { title, body: finalBody },
      data,
      sourceKey,
      logTag: "notifyOrderPlaced",
    });
  } catch (err) {
    console.warn("[fcm] notifyOrderPlaced failed:", err?.message || err);
  }
};

/**
 * Best-effort FCM push after a donation contribution is confirmed paid.
 * Does not throw — failures are logged only.
 */
const notifyDonationReceived = async (
  userId,
  {
    amount,
    currency = "ZAR",
    donationTitle,
    contributionId,
    title = "Thank you for your donation",
    body,
  } = {}
) => {
  try {
    if (!userId) return { sent: 0, failed: 0, pruned: 0 };

    const formattedAmount =
      typeof amount === "number"
        ? `${currency} ${amount.toFixed(2)}`
        : amount
        ? `${currency} ${amount}`
        : null;

    const finalBody =
      body ||
      (donationTitle
        ? `Your ${formattedAmount ? `${formattedAmount} ` : ""}contribution to "${donationTitle}" was received.`
        : `Your ${formattedAmount ? `${formattedAmount} ` : ""}donation was received successfully.`);

    const data = {
      type: "DONATION_RECEIVED",
      userId: String(userId),
      contributionId: contributionId ? String(contributionId) : "",
    };

    const sourceKey = contributionId
      ? `donation:${contributionId}:RECEIVED`
      : `donation:received:${userId}:${Date.now()}`;

    return pushWithInbox(userId, {
      notification: { title, body: finalBody },
      data,
      sourceKey,
      logTag: "notifyDonationReceived",
    });
  } catch (err) {
    console.warn(
      "[fcm] notifyDonationReceived failed:",
      err?.message || err
    );
  }
};

/**
 * Default copy per orderStatus transition. Admins can override by passing
 * { title, body } when calling `notifyOrderStatusChanged`.
 */
const STATUS_COPY = {
  PROCESSING: {
    title: "Your order is being prepared",
    body: (n) => `Order ${n} is now being processed.`,
  },
  SHIPPED: {
    title: "Your order is on its way",
    body: (n) => `Order ${n} has been dispatched. Track it from the app.`,
  },
  DELIVERED: {
    title: "Your order has been delivered",
    body: (n) =>
      `Order ${n} has been marked as delivered. Tap to confirm receipt.`,
  },
  FULFILLED: {
    title: "Thanks for confirming!",
    body: (n) => `Order ${n} is now complete. Enjoy your purchase.`,
  },
  CANCELLED: {
    title: "Your order has been cancelled",
    body: (n) => `Order ${n} has been cancelled by our team.`,
  },
};

/**
 * Best-effort FCM push when an order's status changes (admin or system).
 * Never throws — failures are logged.
 */
const notifyOrderStatusChanged = async (
  userId,
  { order, newStatus, title, body, note = "" } = {}
) => {
  try {
    if (!order || !userId) return { sent: 0, failed: 0, pruned: 0 };
    const status = newStatus || order.orderStatus;
    let copy = STATUS_COPY[status] || {
      title: `Order ${order.orderNumber} update`,
      body: (n) => `Order ${n} status is now ${status}.`,
    };
    if (order.orderType === "REPLACEMENT") {
      if (status === "SHIPPED") {
        copy = {
          title: "Replacement order shipped",
          body: (n) => `Your replacement ${n} is on its way.`,
        };
      } else if (status === "DELIVERED") {
        copy = {
          title: "Replacement order delivered",
          body: (n) =>
            `Your replacement ${n} was marked delivered. Confirm receipt in the app.`,
        };
      } else if (status === "PROCESSING") {
        copy = {
          title: "Replacement order in progress",
          body: (n) => `Your replacement ${n} is being prepared.`,
        };
      }
    }

    const finalTitle = title || copy.title;
    const finalBody =
      body ||
      (typeof copy.body === "function"
        ? copy.body(order.orderNumber)
        : copy.body);

    const data = {
      type: "ORDER_STATUS_CHANGED",
      userId: String(userId),
      orderId: String(order._id),
      orderNumber: String(order.orderNumber || ""),
      orderStatus: String(status),
      orderType: String(order.orderType || "NORMAL"),
      replacementFor: order.replacementFor ? String(order.replacementFor) : "",
      note: note || "",
    };

    return pushWithInbox(userId, {
      notification: { title: finalTitle, body: finalBody },
      data,
      sourceKey: `order:${order._id}:status:${status}`,
      logTag: `notifyOrderStatusChanged(${status})`,
    });
  } catch (err) {
    console.warn(
      "[fcm] notifyOrderStatusChanged failed:",
      err?.message || err
    );
  }
};

/**
 * Best-effort FCM push when Paystack has confirmed a refund settlement.
 */
const notifyRefundProcessed = async (userId, { order } = {}) => {
  try {
    if (!order || !userId) return { sent: 0, failed: 0, pruned: 0 };

    const amount =
      order?.refund?.amount && Number(order.refund.amount) > 0
        ? Number(order.refund.amount)
        : Number(order.totalAmount || 0);
    const currency = order?.refund?.currency || order.currency || "ZAR";
    const formatted = `${currency} ${amount.toFixed(2)}`;

    const title = "Refund processed";
    const body = `Your ${formatted} refund for order ${order.orderNumber} is on its way back to you.`;

    const data = {
      type: "ORDER_REFUND_PROCESSED",
      userId: String(userId),
      orderId: String(order._id),
      orderNumber: String(order.orderNumber || ""),
      refundId: String(order?.refund?.paystackRefundId || ""),
      amount,
      currency,
    };

    return pushWithInbox(userId, {
      notification: { title, body },
      data,
      sourceKey: `order:${order._id}:refund:processed`,
      logTag: "notifyRefundProcessed",
    });
  } catch (err) {
    console.warn("[fcm] notifyRefundProcessed failed:", err?.message || err);
  }
};

module.exports = {
  notifyOrderPlaced,
  notifyDonationReceived,
  notifyOrderStatusChanged,
  notifyRefundProcessed,
};
