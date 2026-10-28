const rateLimit = require("express-rate-limit");

const parsePositiveInt = (value, fallback) => {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const windowMs = parsePositiveInt(
  process.env.WEBSITE_DONATION_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000
);
const max = parsePositiveInt(process.env.WEBSITE_DONATION_RATE_LIMIT_MAX, 20);

const message = {
  success: false,
  message: "Too many donation attempts. Please try again later.",
};

/**
 * Stricter limiter for the public website-donation initiate endpoint.
 * Always enabled (including non-production) to protect PayFast init.
 */
const websiteDonationRateLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message,
  handler: (_req, res) => {
    res.status(429).json(message);
  },
});

module.exports = websiteDonationRateLimiter;
