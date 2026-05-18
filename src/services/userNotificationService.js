const User = require("../models/User");
const UserNotification = require("../models/UserNotification");
const HttpError = require("../utils/httpError");

const notDeleted = { isDeleted: { $ne: true } };

const assertInboxUser = async (userId) => {
  const user = await User.findById(userId).select("role isDeleted");
  if (!user || user.isDeleted) throw new HttpError("User not found", 404);
  if (user.role === "admin" || user.role === "superadmin") {
    throw new HttpError("Use the admin notifications panel for this account", 403);
  }
};

const isInboxRowVisible = (row) => {
  if (row.notification) return true;
  return Boolean(row.title && row.type);
};

const formatInboxItem = (row) => {
  const n = row.notification;
  const data = row.data || n?.data || null;
  return {
    id: String(row._id),
    notificationId: n?._id ? String(n._id) : null,
    title: n?.title || row.title || "",
    body: n?.body || row.body || "",
    imageUrl: n?.imageUrl || row.imageUrl || null,
    data,
    type: row.type || data?.type || "ADMIN_BROADCAST",
    audience: n?.audience,
    sentAt: row.sentAt || n?.sentAt || n?.createdAt || row.createdAt,
    read: Boolean(row.readAt),
    readAt: row.readAt || null,
    createdAt: row.createdAt,
  };
};

/**
 * Persist a transactional inbox item (order status, refund, etc.).
 * Always writes even when the user has no FCM tokens.
 */
const recordInboxNotification = async (
  userId,
  { title, body, imageUrl = null, type, data = null, sourceKey }
) => {
  if (!userId || !sourceKey || !title || !type) return null;

  try {
    const now = new Date();
    return UserNotification.findOneAndUpdate(
      { user: userId, sourceKey },
      {
        $setOnInsert: {
          notification: null,
          readAt: null,
          isDeleted: false,
        },
        $set: {
          title,
          body: body || "",
          imageUrl,
          type,
          data,
          sentAt: now,
        },
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.warn(
      `[inbox] recordInboxNotification(${sourceKey}) failed:`,
      err?.message || err
    );
    return null;
  }
};

/**
 * Upsert inbox rows for every targeted user after a broadcast is sent.
 */
const materializeInboxForUsers = async (notificationId, userIds = []) => {
  const ids = [...new Set(userIds.map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return { upserted: 0 };

  const BATCH = 500;
  let upserted = 0;

  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const ops = slice.map((userId) => ({
      updateOne: {
        filter: { user: userId, notification: notificationId },
        update: {
          $setOnInsert: {
            readAt: null,
            isDeleted: false,
            type: "ADMIN_BROADCAST",
          },
        },
        upsert: true,
      },
    }));
    const result = await UserNotification.bulkWrite(ops, { ordered: false });
    upserted += result.upsertedCount || 0;
  }

  return { upserted };
};

const listForUser = async (userId, query = {}) => {
  await assertInboxUser(userId);

  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 50);
  const skip = (page - 1) * limit;

  const filter = { user: userId, ...notDeleted };
  if (query.unreadOnly === true || query.unreadOnly === "true") {
    filter.readAt = null;
  }

  const [rows, total, unreadCount] = await Promise.all([
    UserNotification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "notification",
        match: { status: "SENT", ...notDeleted },
        select:
          "title body imageUrl data audience sentAt createdAt status",
      }),
    UserNotification.countDocuments(filter),
    UserNotification.countDocuments({ user: userId, readAt: null, ...notDeleted }),
  ]);

  const notifications = rows.filter(isInboxRowVisible).map(formatInboxItem);

  return {
    notifications,
    unreadCount,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

const markAsRead = async (userId, inboxId) => {
  await assertInboxUser(userId);

  const row = await UserNotification.findOneAndUpdate(
    { _id: inboxId, user: userId, ...notDeleted },
    { $set: { readAt: new Date() } },
    { new: true }
  )
    .populate({
      path: "notification",
      match: { status: "SENT", ...notDeleted },
      select: "title body imageUrl data audience sentAt createdAt status",
    })
    .lean();

  if (!row || !isInboxRowVisible(row)) {
    throw new HttpError("Notification not found", 404);
  }

  return { notification: formatInboxItem(row) };
};

const markAllAsRead = async (userId) => {
  await assertInboxUser(userId);

  const result = await UserNotification.updateMany(
    { user: userId, readAt: null, ...notDeleted },
    { $set: { readAt: new Date() } }
  );

  return { modifiedCount: result.modifiedCount || 0 };
};

module.exports = {
  materializeInboxForUsers,
  recordInboxNotification,
  listForUser,
  markAsRead,
  markAllAsRead,
};
