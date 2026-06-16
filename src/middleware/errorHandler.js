const { sendError } = require("../utils/response");

const errorHandler = (err, _req, res, _next) => {
  if (err?.type === "entity.too.large") {
    return sendError(
      res,
      "Request body too large. Reduce image size or increase server upload limit.",
      413
    );
  }

  if (err?.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") {
      return sendError(res, "File too large. Maximum upload size is 10MB.", 413);
    }
    return sendError(res, err.message, 400);
  }

  if (err?.message?.includes("Only image, audio, or video files")) {
    return sendError(res, err.message, 400);
  }

  if (err?.message?.startsWith("CORS blocked for origin:")) {
    return sendError(res, err.message, 403);
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";

  if (statusCode >= 500) {
    console.error("Unhandled error:", err);
  }

  return sendError(res, message, statusCode);
};

module.exports = errorHandler;
