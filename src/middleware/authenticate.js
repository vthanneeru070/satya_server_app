const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config/env");
const HttpError = require("../utils/httpError");

const authenticate = (req, _res, next) => {
  try {
    const authorizationHeader = req.headers.authorization || "";
    const [scheme, token] = authorizationHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      throw new HttpError("Authorization token is required", 401);
    }

    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return next(new HttpError("Invalid or expired access token", 401));
    }
    return next(error);
  }
};

module.exports = authenticate;
