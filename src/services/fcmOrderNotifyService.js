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

module.exports = { notifyOrderPlaced, notifyDonationReceived };
