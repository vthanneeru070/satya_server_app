const rateLimit = require("express-rate-limit");

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";

const parsePositiveInt = (value, fallback) => {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const windowMs = parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const max = parsePositiveInt(process.env.RATE_LIMIT_MAX, isProduction ? 500 : 2000);

const rateLimitEnabled =
  process.env.RATE_LIMIT_ENABLED === "true" ||
  (process.env.RATE_LIMIT_ENABLED !== "false" && isProduction);

const rateLimitMessage = {
  success: false,
  message: "Too many requests, please try again later.",
};

const shouldSkipRateLimit = (req) => {
  const path = (req.path || "").toLowerCase();
  if (path.includes("/webhook")) return true;
  if (path.startsWith("/api-docs")) return true;
  if (path.startsWith("/payment-success") || path.startsWith("/payment-failed")) return true;
  return false;
};

const rateLimiter = rateLimitEnabled
  ? rateLimit({
      windowMs,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      trustProxy: true,
      skip: shouldSkipRateLimit,
      message: rateLimitMessage,
      handler: (_req, res) => {
        res.status(429).json(rateLimitMessage);
      },
    })
  : (_req, _res, next) => next();

module.exports = rateLimiter;
