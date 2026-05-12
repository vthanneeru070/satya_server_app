const admin = require("../config/firebase");
const User = require("../models/User");

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
    if (!tokens.length) return;

    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: { type: "ORDER_PLACED", userId: String(userId) },
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
    if (!tokens.length) return;

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

    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body: finalBody },
      data: {
        type: "DONATION_RECEIVED",
        userId: String(userId),
        contributionId: contributionId ? String(contributionId) : "",
      },
    });
  } catch (err) {
    console.warn(
      "[fcm] notifyDonationReceived failed:",
      err?.message || err
    );
  }
};

module.exports = { notifyOrderPlaced, notifyDonationReceived };
