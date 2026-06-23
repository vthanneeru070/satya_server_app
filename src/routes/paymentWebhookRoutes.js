/**
 * Payment notification routes — MOUNTED BEFORE express.json() in app.js.
 *
 * PayFast ITN uses application/x-www-form-urlencoded (parsed on-route).
 * Legacy Paystack webhooks use raw JSON + HMAC-SHA512 (express.raw on-route).
 */

const express = require("express");
const { paystackWebhook, payfastItn } = require("../controllers/paymentController");

const router = express.Router();

const rawBodyParser = express.raw({ type: "*/*", limit: "1mb" });
const urlencodedParser = express.urlencoded({ extended: false, limit: "1mb" });

const promoteRawBody = (req, _res, next) => {
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
 * /payments/itn:
 *   post:
 *     summary: PayFast ITN receiver (canonical)
 *     description: |
 *       Configure this URL in PayFast as the **Instant Transaction Notification**
 *       endpoint (`PAYFAST_NOTIFY_URL`). PayFast POSTs urlencoded payment data
 *       after checkout. The server validates MD5 signature, confirms with PayFast
 *       `/eng/query/validate`, and marks orders/donations PAID on COMPLETE status.
 *       Always responds `200 OK` with body `OK`.
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               m_payment_id: { type: string }
 *               pf_payment_id: { type: string }
 *               payment_status: { type: string, enum: [COMPLETE, CANCELLED] }
 *               amount_gross: { type: string }
 *               signature: { type: string }
 *     responses:
 *       200: { description: ITN acknowledged }
 */
router.post("/itn", urlencodedParser, payfastItn);

/**
 * @swagger
 * /payments/payfast/itn:
 *   post:
 *     summary: PayFast ITN receiver (alias)
 *     tags: [Payments]
 *     responses:
 *       200: { description: ITN acknowledged }
 */
router.post("/payfast/itn", urlencodedParser, payfastItn);

/**
 * @swagger
 * /payments/webhook:
 *   post:
 *     summary: "[Deprecated] Paystack webhook"
 *     description: Legacy Paystack webhook for historical transactions only.
 *     tags: [Payments]
 *     deprecated: true
 *     responses:
 *       200: { description: Event acknowledged }
 *       401: { description: Invalid signature }
 */
router.post("/webhook", rawBodyParser, promoteRawBody, paystackWebhook);

/**
 * @swagger
 * /payments/paystack/webhook:
 *   post:
 *     summary: "[Deprecated] Paystack webhook alias"
 *     tags: [Payments]
 *     deprecated: true
 *     responses:
 *       200: { description: Event acknowledged }
 */
router.post(
  "/paystack/webhook",
  rawBodyParser,
  promoteRawBody,
  paystackWebhook
);

module.exports = router;
