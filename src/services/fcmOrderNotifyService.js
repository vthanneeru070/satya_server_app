const admin = require("../config/firebase");
const User = require("../models/User");

/**
 * Firebase error codes that mean the token is dead and should be removed:
 *   https://firebase.google.com/docs/cloud-messaging/send-message#admin
 */
const INVALID_TOKEN_ERRORS = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/invalid-argument",
]);

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
      data,
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

/**
 * Best-effort FCM push after order payment. Does not throw — failures are logged only.
 */
const notifyOrderPlaced = async (
  userId,
  {
    title = "Order confirmed",
    body = "Your order has been placed successfully",
  } = {}
) => {
  try {
    const user = await User.findById(userId).select("fcmTokens").lean();
    const tokens = [...new Set((user?.fcmTokens || []).filter(Boolean))];
    return dispatchPush(userId, {
      tokens,
      notification: { title, body },
      data: { type: "ORDER_PLACED", userId: String(userId) },
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
    const user = await User.findById(userId).select("fcmTokens").lean();
    const tokens = [...new Set((user?.fcmTokens || []).filter(Boolean))];

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

    return dispatchPush(userId, {
      tokens,
      notification: { title, body: finalBody },
      data: {
        type: "DONATION_RECEIVED",
        userId: String(userId),
        contributionId: contributionId ? String(contributionId) : "",
      },
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
 *
 * @param {string} userId
 * @param {object} opts
 * @param {object} opts.order        — required, must expose `_id`, `orderNumber`, `orderStatus`
 * @param {string} [opts.newStatus]  — defaults to `opts.order.orderStatus`
 * @param {string} [opts.title]      — override title
 * @param {string} [opts.body]       — override body
 * @param {string} [opts.note]       — short admin note appended to data payload
 */
const notifyOrderStatusChanged = async (
  userId,
  { order, newStatus, title, body, note = "" } = {}
) => {
  try {
    if (!order || !userId) return { sent: 0, failed: 0, pruned: 0 };
    const status = newStatus || order.orderStatus;
    const copy = STATUS_COPY[status] || {
      title: `Order ${order.orderNumber} update`,
      body: (n) => `Order ${n} status is now ${status}.`,
    };

    const finalTitle = title || copy.title;
    const finalBody =
      body ||
      (typeof copy.body === "function" ? copy.body(order.orderNumber) : copy.body);

    const user = await User.findById(userId).select("fcmTokens").lean();
    const tokens = [...new Set((user?.fcmTokens || []).filter(Boolean))];
    return dispatchPush(userId, {
      tokens,
      notification: { title: finalTitle, body: finalBody },
      data: {
        type: "ORDER_STATUS_CHANGED",
        userId: String(userId),
        orderId: String(order._id),
        orderNumber: String(order.orderNumber || ""),
        orderStatus: String(status),
        note: note || "",
      },
      logTag: `notifyOrderStatusChanged(${status})`,
    });
  } catch (err) {
    console.warn(
      "[fcm] notifyOrderStatusChanged failed:",
      err?.message || err
    );
  }
};

module.exports = {
  notifyOrderPlaced,
  notifyDonationReceived,
  notifyOrderStatusChanged,
};
