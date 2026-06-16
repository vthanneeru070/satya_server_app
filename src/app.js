const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const swaggerUi = require("swagger-ui-express");
const routes = require("./routes");
const uploadRoutes = require("./routes/uploadRoutes");
const paymentWebhookRoutes = require("./routes/paymentWebhookRoutes");
const paymentLandingRoutes = require("./routes/paymentLandingRoutes");
const swaggerSpec = require("./config/swagger");
const requestLogger = require("./middleware/requestLogger");
const rateLimiter = require("./middleware/rateLimiter");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// Render / reverse proxies: use X-Forwarded-For so rate limits are per client, not shared.
// app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    origin: '*',
    credentials: true,
  })
);
// app.use(rateLimiter);

// IMPORTANT: payment webhooks MUST receive the raw body so HMAC signatures can
// be verified bit-for-bit against what Paystack sent. Mount BEFORE express.json().
app.use("/api/v1/payments", paymentWebhookRoutes);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use("/api/v1", routes);
app.use("/api", uploadRoutes);

// Public Paystack redirect landing pages (PAYSTACK_CALLBACK_URL lands here).
// Mounted at the root — outside /api/v1 — so the browser/WebView sees a page
// instead of the JSON 404. Settlement is handled separately via the webhook
// and the authenticated GET /api/v1/payments/verify/:reference call.
app.use("/", paymentLandingRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
