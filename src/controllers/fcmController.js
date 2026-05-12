const User = require("../models/User");
const HttpError = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");

/**
 * Register an FCM device token for the authenticated user.
 * Uses $addToSet to dedupe at the DB layer regardless of concurrent calls.
 */
const registerToken = async (req, res, next) => {
  try {
    const { token } = req.body;
    const userId = req.user.userId;

    const result = await User.updateOne(
      { _id: userId, isDeleted: { $ne: true } },
      { $addToSet: { fcmTokens: token } }
    );

    if (!result.matchedCount) throw new HttpError("User not found", 404);

    return sendSuccess(res, { registered: true }, "FCM token registered");
  } catch (error) {
    return next(error);
  }
};

/**
 * Unregister a single FCM token for the authenticated user (e.g. on logout
 * or when Firebase rotates the device token).
 */
const unregisterToken = async (req, res, next) => {
  try {
    const { token } = req.body;
    const userId = req.user.userId;

    const result = await User.updateOne(
      { _id: userId, isDeleted: { $ne: true } },
      { $pull: { fcmTokens: token } }
    );

    if (!result.matchedCount) throw new HttpError("User not found", 404);

    return sendSuccess(res, { unregistered: true }, "FCM token removed");
  } catch (error) {
    return next(error);
  }
};

/**
 * Returns the count of FCM tokens registered for the authenticated user.
 * Useful from the Flutter client to confirm registration succeeded.
 */
const getMyTokenStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId)
      .select("fcmTokens")
      .lean();
    if (!user) throw new HttpError("User not found", 404);
    return sendSuccess(
      res,
      { count: (user.fcmTokens || []).length },
      "FCM token status"
    );
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  registerToken,
  unregisterToken,
  getMyTokenStatus,
};
