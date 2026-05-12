const Notification = require("../models/Notification");
const HttpError = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");
const notificationBroadcastService = require("../services/notificationBroadcastService");

/**
 * Admin / Superadmin: create + send (or schedule) a push notification.
 */
const sendNotification = async (req, res, next) => {
  try {
    const {
      title,
      body,
      audience = "ALL",
      userIds = [],
      data = null,
      imageUrl,
      scheduledAt,
    } = req.body;

    const doc = await notificationBroadcastService.createNotification({
      title,
      body,
      audience,
      userIds,
      data,
      imageUrl,
      scheduledAt,
      sentBy: req.user.userId,
    });

    const wasScheduled = doc.status === "SCHEDULED";

    return sendSuccess(
      res,
      { notification: doc },
      wasScheduled
        ? "Notification scheduled successfully"
        : "Notification queued for delivery",
      201
    );
  } catch (error) {
    return next(error);
  }
};

/**
 * List broadcast notifications (admin history view).
 * Admins see all; could be tightened later if needed.
 */
const listNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, audience } = req.query;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const filter = { isDeleted: { $ne: true } };
    if (status) filter.status = status;
    if (audience) filter.audience = audience;

    const [items, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("sentBy", "fullName email role"),
      Notification.countDocuments(filter),
    ]);

    return sendSuccess(
      res,
      {
        items,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.max(Math.ceil(total / limitNum), 1),
        },
      },
      "Notifications fetched"
    );
  } catch (error) {
    return next(error);
  }
};

const getNotificationById = async (req, res, next) => {
  try {
    const doc = await Notification.findOne({
      _id: req.params.id,
      isDeleted: { $ne: true },
    }).populate("sentBy", "fullName email role");
    if (!doc) throw new HttpError("Notification not found", 404);
    return sendSuccess(res, { notification: doc }, "Notification fetched");
  } catch (error) {
    return next(error);
  }
};

/**
 * Cancel a scheduled notification (only before it has started sending).
 */
const cancelNotification = async (req, res, next) => {
  try {
    const updated = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        status: "SCHEDULED",
        isDeleted: { $ne: true },
      },
      { $set: { status: "CANCELLED" } },
      { new: true }
    );
    if (!updated) {
      throw new HttpError(
        "Notification not found, already sent, or not in SCHEDULED state",
        404
      );
    }
    return sendSuccess(
      res,
      { notification: updated },
      "Notification cancelled"
    );
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  sendNotification,
  listNotifications,
  getNotificationById,
  cancelNotification,
};
