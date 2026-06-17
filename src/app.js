const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const swaggerUi = require("swagger-ui-express");
const routes = require("./routes");
const uploadRoutes = require("./routes/uploadRoutes");
const paymentWebhookRoutes = require("./routes/paymentWebhookRoutes");
const paymentLandingRoutes = require("./routes/paymentLandingRoutes");
const swaggerSpec = require("./config/swagger");
const { corsOptions } = require("./config/cors");
const requestLogger = require("./middleware/requestLogger");
const rateLimiter = require("./middleware/rateLimiter");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "15mb";

const app = express();

// EC2 / nginx reverse proxy — needed for correct client IP and secure cookies.
app.set("trust proxy", 1);

// CORS before helmet so preflight OPTIONS always gets ACAO headers first.
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.use(helmet());
// app.use(rateLimiter);

// IMPORTANT: payment webhooks MUST receive the raw body so HMAC signatures can
// be verified bit-for-bit against what Paystack sent. Mount BEFORE express.json().
app.use("/api/v1/payments", paymentWebhookRoutes);

app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

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
