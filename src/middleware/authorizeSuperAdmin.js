const HttpError = require("../utils/httpError");

/**
 * authorizeSuperAdmin — only role: "superadmin" is allowed.
 */
const authorizeSuperAdmin = (req, _res, next) => {
  if (!req.user) {
    return next(new HttpError("Unauthorized", 401));
  }
  if (req.user.role !== "superadmin") {
    return next(new HttpError("Super admin access required", 403));
  }
  return next();
};

module.exports = authorizeSuperAdmin;
