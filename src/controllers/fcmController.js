const { sendSuccess } = require("../utils/response");
const fcmTokenService = require("../services/fcmTokenService");

/**
 * Register FCM token (mobile user or Flutter web admin).
 * Supports multiple devices/tabs per account via fcmDevices + fcmTokens.
 */
const registerToken = async (req, res, next) => {
  try {
    const { token, deviceId, platform } = req.body;
    const data = await fcmTokenService.registerDeviceToken(req.user.userId, {
      token,
      deviceId,
      platform,
    });
    return sendSuccess(res, data, "FCM token registered");
  } catch (error) {
    return next(error);
  }
};

const unregisterToken = async (req, res, next) => {
  try {
    const { token } = req.body;
    const data = await fcmTokenService.unregisterDeviceToken(req.user.userId, {
      token,
    });
    return sendSuccess(res, data, "FCM token removed");
  } catch (error) {
    return next(error);
  }
};

const getMyTokenStatus = async (req, res, next) => {
  try {
    const data = await fcmTokenService.getTokenStatus(req.user.userId);
    return sendSuccess(res, data, "FCM token status");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  registerToken,
  unregisterToken,
  getMyTokenStatus,
};
