const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config/env");
const User = require("../models/User");
const HttpError = require("../utils/httpError");

const LAST_ACTIVE_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

const authenticate = async (req, _res, next) => {
  try {
    const authorizationHeader = req.headers.authorization || "";
    const [scheme, token] = authorizationHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      throw new HttpError("Authorization token is required", 401);
    }

    const decoded = jwt.verify(token, jwtSecret);
    const user = await User.findById(decoded.userId).select("role isSuperAdmin lastActiveAt");
    if (!user) {
      throw new HttpError("User not found", 401);
    }

    req.user = {
      userId: user._id.toString(),
      role: user.role,
      isSuperAdmin: user.isSuperAdmin,
    };

    const now = Date.now();
    const lastActiveAtMs = user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : 0;
    if (!lastActiveAtMs || now - lastActiveAtMs >= LAST_ACTIVE_UPDATE_INTERVAL_MS) {
      User.updateOne({ _id: user._id }, { $set: { lastActiveAt: new Date(now) } }).catch(() => {});
    }

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return next(new HttpError("Invalid or expired access token", 401));
    }
    return next(error);
  }
};

module.exports = authenticate;
