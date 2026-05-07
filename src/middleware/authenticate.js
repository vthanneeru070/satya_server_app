const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config/env");
const User = require("../models/User");
const HttpError = require("../utils/httpError");

const LAST_ACTIVE_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * authenticate
 *
 * Verifies the server-issued JWT, loads the user, blocks soft-deleted accounts,
 * and attaches a thin `req.user` payload:
 *   - userId
 *   - role             ("user" | "admin" | "superadmin")
 *   - canLoginAdminPanel
 *   - isSuperAdmin     (DERIVED from role for legacy controller compatibility)
 *
 * NOTE: `isSuperAdmin` is no longer a persisted field; it's computed here.
 */
const authenticate = async (req, _res, next) => {
  try {
    const authorizationHeader = req.headers.authorization || "";
    const [scheme, token] = authorizationHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      throw new HttpError("Authorization token is required", 401);
    }

    const decoded = jwt.verify(token, jwtSecret);
    const user = await User.findById(decoded.userId).select(
      "role canLoginAdminPanel lastActiveAt isDeleted"
    );

    if (!user) {
      throw new HttpError("User not found", 401);
    }

    if (user.isDeleted) {
      throw new HttpError(
        "Account has been deleted. Please log in again to restore.",
        401
      );
    }

    req.user = {
      userId: user._id.toString(),
      role: user.role,
      canLoginAdminPanel: !!user.canLoginAdminPanel,
      isSuperAdmin: user.role === "superadmin",
    };

    const now = Date.now();
    const lastActiveAtMs = user.lastActiveAt
      ? new Date(user.lastActiveAt).getTime()
      : 0;
    if (!lastActiveAtMs || now - lastActiveAtMs >= LAST_ACTIVE_UPDATE_INTERVAL_MS) {
      User.updateOne(
        { _id: user._id },
        { $set: { lastActiveAt: new Date(now) } }
      ).catch(() => {});
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
