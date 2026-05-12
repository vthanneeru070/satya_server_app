/**
 * Payment webhook routes — MOUNTED BEFORE express.json() in app.js.
 *
 * Why: webhook signature verification (HMAC-SHA512) MUST run over the raw
 * request body Paystack actually sent. If express.json() runs first and parses
 * the body, the bytes we hash will be a re-serialized version and the HMAC
 * will never match (whitespace, key order, escaping all differ).
 *
 * The express.raw() middleware on this route gives us:
 *   - req.body: the raw Buffer
 * which the controller then parses with JSON.parse, after the HMAC check.
 */

const express = require("express");
const { paystackWebhook } = require("../controllers/paymentController");

const router = express.Router();

const rawBodyParser = express.raw({ type: "*/*", limit: "1mb" });

const promoteRawBody = (req, _res, next) => {
  // Preserve the raw bytes for HMAC, then promote the parsed JSON onto req.body
  // so downstream code (and Swagger) can treat it like any other endpoint.
  req.rawBody = req.body;
  try {
    req.body = req.rawBody && req.rawBody.length
      ? JSON.parse(req.rawBody.toString("utf8"))
      : {};
  } catch (_) {
    req.body = {};
  }
  next();
};

/**
 * @swagger
 * /payments/webhook:
 *   post:
 *     summary: Paystack webhook receiver (server-to-server)
 *     description: |
 *       Canonical webhook URL (matches `PAYSTACK_WEBHOOK_URL`). Paystack's
 *       servers POST here when a transaction event occurs (`charge.success`,
 *       `charge.failed`, etc). Validates the `x-paystack-signature` HMAC-SHA512
 *       header against the raw body using `PAYSTACK_SECRET_KEY`. Always responds
 *       200 OK after acknowledgement so Paystack stops retrying — see server
 *       logs for processing results. Settlement for both ORDER and DONATION
 *       payments flows through the same idempotent verify path.
 *     tags: [Payments]
 *     responses:
 *       200: { description: Event acknowledged }
 *       401: { description: Invalid signature }
 */
router.post("/webhook", rawBodyParser, promoteRawBody, paystackWebhook);

/**
 * @swagger
 * /payments/paystack/webhook:
 *   post:
 *     summary: Paystack webhook receiver (legacy alias)
 *     description: |
 *       Legacy alias for `POST /payments/webhook`. Kept for any Paystack
 *       configuration that still points here. New deployments should use the
 *       canonical path that matches `PAYSTACK_WEBHOOK_URL`.
 *     tags: [Payments]
 *     responses:
 *       200: { description: Event acknowledged }
 *       401: { description: Invalid signature }
 */
router.post(
  "/paystack/webhook",
  rawBodyParser,
  promoteRawBody,
  paystackWebhook
);

module.exports = router;
