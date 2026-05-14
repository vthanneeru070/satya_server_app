const User = require("../models/User");
const admin = require("../config/firebase");

const INVALID_TOKEN_ERRORS = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/invalid-argument",
]);

const sendMulticast = async (userId, payload, logTag) => {
  const user = await User.findById(userId).select("fcmTokens").lean();
  const tokens = [...new Set((user?.fcmTokens || []).filter(Boolean))];
  if (!tokens.length) {
    console.warn(`[fcm] ${logTag}: user ${userId} has 0 tokens`);
    return { sent: 0, failed: 0, pruned: 0 };
  }
  let response;
  try {
    response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: payload.notification,
      data: payload.data,
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
    console.warn(`[fcm] ${logTag}:`, err?.message || err);
    return { sent: 0, failed: tokens.length, pruned: 0 };
  }
  const deadTokens = [];
  response.responses.forEach((r, idx) => {
    if (!r.success && INVALID_TOKEN_ERRORS.has(r.error?.code)) {
      deadTokens.push(tokens[idx]);
    }
  });
  if (deadTokens.length) {
    await User.updateOne(
      { _id: userId },
      { $pull: { fcmTokens: { $in: deadTokens } } }
    ).catch(() => {});
  }
  return {
    sent: response.successCount,
    failed: response.failureCount,
    pruned: deadTokens.length,
  };
};

const notifyUserReplacementSubmitted = async (userId, request) => {
  try {
    if (!userId || !request) return;
    return sendMulticast(
      userId,
      {
        notification: {
          title: "Replacement request received",
          body: `We received your request ${request.requestNumber}. Our team will review it shortly.`,
        },
        data: {
          type: "REPLACEMENT_REQUEST_SUBMITTED",
          requestId: String(request._id),
          requestNumber: String(request.requestNumber || ""),
          orderId: String(request.order?._id || request.order || ""),
        },
      },
      "notifyUserReplacementSubmitted"
    );
  } catch (e) {
    console.warn("[fcm] notifyUserReplacementSubmitted:", e?.message || e);
  }
};

const notifyUserReplacementApproved = async (userId, request) => {
  try {
    if (!userId || !request) return;
    const repNo =
      request.replacementOrder?.orderNumber ||
      (typeof request.replacementOrder === "object" && request.replacementOrder?.orderNumber) ||
      "";
    return sendMulticast(
      userId,
      {
        notification: {
          title: "Replacement approved",
          body: repNo
            ? `Your replacement order ${repNo} is being prepared.`
            : "Your replacement has been approved and is being prepared.",
        },
        data: {
          type: "REPLACEMENT_APPROVED",
          requestId: String(request._id),
          requestNumber: String(request.requestNumber || ""),
          replacementOrderId: String(
            request.replacementOrder?._id || request.replacementOrder || ""
          ),
          replacementOrderNumber: String(repNo),
        },
      },
      "notifyUserReplacementApproved"
    );
  } catch (e) {
    console.warn("[fcm] notifyUserReplacementApproved:", e?.message || e);
  }
};

const notifyUserReplacementRejected = async (userId, request) => {
  try {
    if (!userId || !request) return;
    return sendMulticast(
      userId,
      {
        notification: {
          title: "Replacement request update",
          body: `Your replacement request ${request.requestNumber} was not approved.`,
        },
        data: {
          type: "REPLACEMENT_REJECTED",
          requestId: String(request._id),
          requestNumber: String(request.requestNumber || ""),
        },
      },
      "notifyUserReplacementRejected"
    );
  } catch (e) {
    console.warn("[fcm] notifyUserReplacementRejected:", e?.message || e);
  }
};

const notifyAdminsNewReplacementRequest = async (request) => {
  try {
    if (!request) return;
    const admins = await User.find({
      role: { $in: ["admin", "superadmin"] },
      isDeleted: { $ne: true },
    })
      .select("_id")
      .lean();
    await Promise.all(
      admins.map((a) =>
        sendMulticast(
          a._id,
          {
            notification: {
              title: "New replacement request",
              body: `${request.requestNumber} — review in admin tools.`,
            },
            data: {
              type: "ADMIN_REPLACEMENT_REQUEST",
              requestId: String(request._id),
              requestNumber: String(request.requestNumber || ""),
              orderId: String(request.order?._id || request.order || ""),
            },
          },
          "notifyAdminsNewReplacementRequest"
        )
      )
    );
  } catch (e) {
    console.warn("[fcm] notifyAdminsNewReplacementRequest:", e?.message || e);
  }
};

module.exports = {
  notifyUserReplacementSubmitted,
  notifyUserReplacementApproved,
  notifyUserReplacementRejected,
  notifyAdminsNewReplacementRequest,
};
