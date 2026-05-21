const { sendSuccess } = require("../utils/response");
const adminNotificationService = require("../services/adminNotificationService");

const listNotifications = async (req, res, next) => {
  try {
    const data = await adminNotificationService.listForAdmin(
      req.user.userId,
      req.query
    );
    return sendSuccess(res, data, "Admin notifications fetched");
  } catch (error) {
    return next(error);
  }
};

const getUnreadCount = async (req, res, next) => {
  try {
    const unreadCount = await adminNotificationService.countUnread(
      req.user.userId
    );
    return sendSuccess(res, { unreadCount }, "Unread count fetched");
  } catch (error) {
    return next(error);
  }
};

const getNotificationById = async (req, res, next) => {
  try {
    const data = await adminNotificationService.getById(
      req.user.userId,
      req.params.id
    );
    return sendSuccess(res, data, "Notification fetched");
  } catch (error) {
    return next(error);
  }
};

const markRead = async (req, res, next) => {
  try {
    const data = await adminNotificationService.markAsRead(
      req.user.userId,
      req.params.id
    );
    return sendSuccess(res, data, "Notification marked as read");
  } catch (error) {
    return next(error);
  }
};

const markAllRead = async (req, res, next) => {
  try {
    const data = await adminNotificationService.markAllAsRead(req.user.userId);
    return sendSuccess(res, data, "All notifications marked as read");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listNotifications,
  getUnreadCount,
  getNotificationById,
  markRead,
  markAllRead,
};
