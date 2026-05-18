const { sendSuccess } = require("../utils/response");
const userNotificationService = require("../services/userNotificationService");

const listMyNotifications = async (req, res, next) => {
  try {
    const data = await userNotificationService.listForUser(req.user.userId, req.query);
    return sendSuccess(res, data, "Notifications fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const markNotificationRead = async (req, res, next) => {
  try {
    const data = await userNotificationService.markAsRead(
      req.user.userId,
      req.params.id
    );
    return sendSuccess(res, data, "Notification marked as read");
  } catch (error) {
    return next(error);
  }
};

const markAllNotificationsRead = async (req, res, next) => {
  try {
    const data = await userNotificationService.markAllAsRead(req.user.userId);
    return sendSuccess(res, data, "All notifications marked as read");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
