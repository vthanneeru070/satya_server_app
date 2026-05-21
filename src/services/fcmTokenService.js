const User = require("../models/User");
const HttpError = require("../utils/httpError");

/**
 * Register or refresh an FCM device for the authenticated user.
 * Supports multiple devices/tabs (web) via unique tokens.
 * Keeps legacy `fcmTokens: string[]` in sync for existing push code.
 */
const registerDeviceToken = async (userId, { token, platform, deviceId }) => {
  const now = new Date();
  const device = {
    token,
    platform: platform || null,
    deviceId: deviceId || null,
    updatedAt: now,
  };

  const user = await User.findOne({ _id: userId, isDeleted: { $ne: true } });
  if (!user) throw new HttpError("User not found", 404);

  const devices = Array.isArray(user.fcmDevices) ? [...user.fcmDevices] : [];
  const idx = devices.findIndex((d) => d.token === token);
  if (idx >= 0) {
    devices[idx] = { ...devices[idx].toObject?.() ?? devices[idx], ...device };
  } else {
    devices.push(device);
  }

  user.fcmDevices = devices;
  user.fcmTokens = [...new Set(devices.map((d) => d.token).filter(Boolean))];
  await user.save();

  return {
    registered: true,
    tokenCount: user.fcmTokens.length,
    deviceCount: user.fcmDevices.length,
  };
};

const unregisterDeviceToken = async (userId, { token }) => {
  const user = await User.findOne({ _id: userId, isDeleted: { $ne: true } });
  if (!user) throw new HttpError("User not found", 404);

  user.fcmDevices = (user.fcmDevices || []).filter((d) => d.token !== token);
  user.fcmTokens = [...new Set(user.fcmDevices.map((d) => d.token).filter(Boolean))];
  await user.save();

  return { unregistered: true, tokenCount: user.fcmTokens.length };
};

const getTokenStatus = async (userId) => {
  const user = await User.findById(userId)
    .select("fcmTokens fcmDevices role")
    .lean();
  if (!user) throw new HttpError("User not found", 404);

  return {
    count: (user.fcmTokens || []).length,
    devices: (user.fcmDevices || []).map((d) => ({
      platform: d.platform,
      deviceId: d.deviceId,
      updatedAt: d.updatedAt,
      tokenPreview: d.token ? `${d.token.slice(0, 8)}…` : "",
    })),
    role: user.role,
  };
};

module.exports = {
  registerDeviceToken,
  unregisterDeviceToken,
  getTokenStatus,
};
