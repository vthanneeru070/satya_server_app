const admin = require("../config/firebase");
const User = require("../models/User");
const Notification = require("../models/Notification");

/**
 * FCM accepts up to 500 tokens per multicast request.
 */
const FCM_MULTICAST_LIMIT = 500;

const INVALID_TOKEN_ERRORS = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/invalid-argument",
]);

const buildAudienceFilter = (audience, userIds = []) => {
  const base = {
    isDeleted: { $ne: true },
    fcmTokens: { $exists: true, $not: { $size: 0 } },
  };
  switch (audience) {
    case "USERS":
      return { ...base, role: "user" };
    case "ADMINS":
      return { ...base, role: "admin" };
    case "SUPERADMIN":
      return { ...base, role: "superadmin" };
    case "USER_IDS":
      return { ...base, _id: { $in: userIds } };
    case "ALL":
    default:
      return base;
  }
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Send a single multicast batch via FCM and report which tokens are dead so
 * the caller can prune them.
 */
const sendBatch = async ({ tokens, notification, data, imageUrl, logTag }) => {
  if (!tokens.length) return { sent: 0, failed: 0, deadTokens: [] };

  const messagePayload = {
    tokens,
    notification: imageUrl
      ? { ...notification, imageUrl }
      : notification,
    data,
  };

  let response;
  try {
    response = await admin.messaging().sendEachForMulticast(messagePayload);
  } catch (err) {
    console.error(
      `[fcm] ${logTag}: batch send threw:`,
      err?.message || err
    );
    return { sent: 0, failed: tokens.length, deadTokens: [] };
  }

  const deadTokens = [];
  response.responses.forEach((r, idx) => {
    if (!r.success) {
      const code = r.error?.code || "unknown";
      if (INVALID_TOKEN_ERRORS.has(code)) deadTokens.push(tokens[idx]);
    }
  });

  return {
    sent: response.successCount,
    failed: response.failureCount,
    deadTokens,
  };
};

/**
 * Prune dead tokens from the users they belong to. Tokens are unique enough
 * across users that a single `$pull` query suffices.
 */
const pruneDeadTokens = async (deadTokens, logTag) => {
  if (!deadTokens.length) return 0;
  try {
    const res = await User.updateMany(
      { fcmTokens: { $in: deadTokens } },
      { $pull: { fcmTokens: { $in: deadTokens } } }
    );
    return res.modifiedCount || 0;
  } catch (err) {
    console.warn(
      `[fcm] ${logTag}: failed to prune ${deadTokens.length} dead tokens:`,
      err?.message || err
    );
    return 0;
  }
};

/**
 * Materialize the recipient token list for a notification and dispatch it.
 * Updates the Notification row with aggregate counts.
 *
 * IMPORTANT: this is the only function that flips a notification to SENT
 * (or FAILED). It uses an atomic findOneAndUpdate to claim the row first,
 * preventing duplicate sends if the dispatcher runs twice.
 */
const dispatchNotification = async (notificationId) => {
  const logTag = `notification ${notificationId}`;

  const claimed = await Notification.findOneAndUpdate(
    {
      _id: notificationId,
      status: { $in: ["PENDING", "SCHEDULED"] },
      isDeleted: { $ne: true },
    },
    { $set: { status: "SENDING" } },
    { new: true }
  );
  if (!claimed) {
    return { skipped: true, reason: "already processed or not found" };
  }

  try {
    const filter = buildAudienceFilter(claimed.audience, claimed.userIds);
    const users = await User.find(filter)
      .select("fcmTokens")
      .lean();

    const allTokens = [];
    users.forEach((u) =>
      (u.fcmTokens || []).filter(Boolean).forEach((t) => allTokens.push(t))
    );
    const uniqueTokens = [...new Set(allTokens)];

    if (!uniqueTokens.length) {
      claimed.status = "SENT";
      claimed.sentAt = new Date();
      claimed.targetedUserCount = users.length;
      claimed.targetedTokenCount = 0;
      await claimed.save();
      console.warn(
        `[fcm] ${logTag}: 0 tokens — marking SENT (no recipients to push).`
      );
      return {
        sent: 0,
        failed: 0,
        targetedUsers: users.length,
        targetedTokens: 0,
      };
    }

    const batches = chunk(uniqueTokens, FCM_MULTICAST_LIMIT);

    const notificationPayload = {
      title: claimed.title,
      body: claimed.body,
    };

    const dataPayload = {
      type: "ADMIN_BROADCAST",
      notificationId: String(claimed._id),
      ...(claimed.data && typeof claimed.data === "object"
        ? Object.fromEntries(
            Object.entries(claimed.data).map(([k, v]) => [k, String(v)])
          )
        : {}),
    };

    let totalSent = 0;
    let totalFailed = 0;
    const allDead = [];

    for (const batch of batches) {
      const r = await sendBatch({
        tokens: batch,
        notification: notificationPayload,
        data: dataPayload,
        imageUrl: claimed.imageUrl,
        logTag,
      });
      totalSent += r.sent;
      totalFailed += r.failed;
      allDead.push(...r.deadTokens);
    }

    const pruned = await pruneDeadTokens(allDead, logTag);

    claimed.status = "SENT";
    claimed.sentAt = new Date();
    claimed.targetedUserCount = users.length;
    claimed.targetedTokenCount = uniqueTokens.length;
    claimed.successCount = totalSent;
    claimed.failureCount = totalFailed;
    claimed.prunedTokenCount = pruned;
    await claimed.save();

    console.log(
      `[fcm] ${logTag}: users=${users.length} tokens=${uniqueTokens.length} sent=${totalSent} failed=${totalFailed} pruned=${pruned}`
    );

    return {
      sent: totalSent,
      failed: totalFailed,
      pruned,
      targetedUsers: users.length,
      targetedTokens: uniqueTokens.length,
    };
  } catch (err) {
    claimed.status = "FAILED";
    claimed.errorMessage = err?.message || String(err);
    await claimed.save();
    console.error(
      `[fcm] ${logTag}: dispatch failed:`,
      err?.message || err
    );
    throw err;
  }
};

/**
 * Create + send (or schedule) a notification. Returns the final notification doc.
 *
 * For immediate sends, the dispatch is awaited so the admin gets accurate
 * `status`, `targetedTokenCount`, `successCount`, and `failureCount` back in
 * the response — no polling required.
 *
 * For scheduled sends, returns immediately in `SCHEDULED` state; the in-process
 * scheduler picks it up at `scheduledAt`.
 */
const createNotification = async ({
  title,
  body,
  audience = "ALL",
  userIds = [],
  data = null,
  imageUrl = null,
  scheduledAt = null,
  sentBy,
}) => {
  const isScheduled = scheduledAt && new Date(scheduledAt) > new Date();
  const doc = await Notification.create({
    title,
    body,
    audience,
    userIds: audience === "USER_IDS" ? userIds : [],
    data,
    imageUrl,
    scheduledAt: isScheduled ? new Date(scheduledAt) : null,
    status: isScheduled ? "SCHEDULED" : "PENDING",
    sentBy,
  });

  if (isScheduled) return doc;

  try {
    await dispatchNotification(doc._id);
  } catch (err) {
    console.error(
      `[fcm] notification ${doc._id} dispatch error:`,
      err?.message || err
    );
  }
  // Return the up-to-date document (dispatch wrote status/counts).
  return Notification.findById(doc._id);
};

/**
 * Periodic dispatcher: picks up SCHEDULED notifications that are now due.
 * Safe to call repeatedly because `dispatchNotification` claims atomically.
 */
const dispatchDueScheduledNotifications = async () => {
  const now = new Date();
  const due = await Notification.find({
    status: "SCHEDULED",
    isDeleted: { $ne: true },
    scheduledAt: { $lte: now },
  })
    .select("_id")
    .limit(20)
    .lean();

  for (const n of due) {
    try {
      await dispatchNotification(n._id);
    } catch (_err) {
      // dispatchNotification already logs + persists FAILED status.
    }
  }
  return { processed: due.length };
};

let schedulerHandle = null;

/**
 * Start the scheduler. Safe to call once at boot. Intervals run forever until
 * `stopScheduler()` is called (tests / shutdown).
 */
const startScheduler = ({ intervalMs = 60_000 } = {}) => {
  if (schedulerHandle) return;
  schedulerHandle = setInterval(() => {
    dispatchDueScheduledNotifications().catch((err) =>
      console.warn(
        "[fcm] scheduler tick error:",
        err?.message || err
      )
    );
  }, intervalMs);
  if (schedulerHandle.unref) schedulerHandle.unref();
  console.log(
    `[fcm] notification scheduler started (every ${intervalMs}ms).`
  );
};

const stopScheduler = () => {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
  }
};

module.exports = {
  createNotification,
  dispatchNotification,
  dispatchDueScheduledNotifications,
  startScheduler,
  stopScheduler,
};
