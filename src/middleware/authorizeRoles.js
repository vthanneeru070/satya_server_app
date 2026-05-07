const HttpError = require("../utils/httpError");

/**
 * authorizeRoles
 *
 * Role-based gate. Hierarchy: superadmin > admin > user.
 * Passing "admin" implicitly allows superadmin (superadmins can do anything an admin can).
 * Passing "user" implicitly allows admin AND superadmin.
 */
const authorizeRoles = (...roles) => {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new HttpError("Unauthorized", 401));
    }

    const allowed = new Set(roles);
    if (allowed.has("admin")) allowed.add("superadmin");
    if (allowed.has("user")) {
      allowed.add("admin");
      allowed.add("superadmin");
    }

    if (!allowed.has(req.user.role)) {
      return next(
        new HttpError("You are not authorized to access this resource", 403)
      );
    }
    return next();
  };
};

module.exports = authorizeRoles;
