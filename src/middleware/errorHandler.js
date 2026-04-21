const { sendError } = require("../utils/response");

const errorHandler = (err, _req, res, _next) => {
  if (err?.name === "MulterError" || err?.message?.includes("Only image, audio, or video files")) {
    return sendError(res, err.message, 400);
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";

  if (statusCode >= 500) {
    console.error("Unhandled error:", err);
  }

  return sendError(res, message, statusCode);
};

module.exports = errorHandler;
