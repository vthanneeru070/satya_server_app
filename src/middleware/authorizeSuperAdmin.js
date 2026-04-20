const HttpError = require("../utils/httpError");

const authorizeSuperAdmin = (req, _res, next) => {
  if (!req.user || req.user.isSuperAdmin !== true) {
    return next(new HttpError("Super admin access required", 403));
  }

  return next();
};

module.exports = authorizeSuperAdmin;
