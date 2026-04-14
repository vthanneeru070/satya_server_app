const HttpError = require("../utils/httpError");

const authorizeRoles = (...roles) => {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError("You are not authorized to access this resource", 403));
    }
    return next();
  };
};

module.exports = authorizeRoles;
