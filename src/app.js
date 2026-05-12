const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const swaggerUi = require("swagger-ui-express");
const routes = require("./routes");
const uploadRoutes = require("./routes/uploadRoutes");
const paymentWebhookRoutes = require("./routes/paymentWebhookRoutes");
const swaggerSpec = require("./config/swagger");
const requestLogger = require("./middleware/requestLogger");
const rateLimiter = require("./middleware/rateLimiter");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: ["http://localhost:3000","https://satya-devotte-app-yc6c.vercel.app", "https://satya-devotte-app-yc6c-venkats-projects-9161ee90.vercel.app"],
    credentials: true,
  })
);
app.use(requestLogger);
app.use(rateLimiter);

// IMPORTANT: payment webhooks MUST receive the raw body so HMAC signatures can
// be verified bit-for-bit against what Paystack sent. Mount BEFORE express.json().
app.use("/api/v1/payments", paymentWebhookRoutes);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use("/api/v1", routes);
app.use("/api", uploadRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
