const { sendError } = require("../utils/response");

const errorHandler = (err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";

  if (statusCode >= 500) {
    console.error("Unhandled error:", err);
  }

  return sendError(res, message, statusCode);
};

module.exports = errorHandler;
