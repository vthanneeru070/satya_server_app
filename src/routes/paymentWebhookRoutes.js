/**
 * Payment notification routes — MOUNTED BEFORE express.json() in app.js.
 *
 * PayFast ITN uses raw application/x-www-form-urlencoded (field order matters
 * for MD5 signature verification). Legacy Paystack webhooks use raw JSON.
 */

const express = require("express");
const { paystackWebhook, payfastItn } = require("../controllers/paymentController");

const router = express.Router();

const rawBodyParser = express.raw({ type: "*/*", limit: "1mb" });
const rawUrlencodedParser = express.raw({
  type: "application/x-www-form-urlencoded",
  limit: "1mb",
});

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

const promoteItnRawBody = (req, _res, next) => {
  req.rawItnBody = req.body;
  next();
};

/**
 * @swagger
 * /payments/itn:
 *   post:
 *     summary: PayFast ITN receiver (canonical)
 *     tags: [Payments]
 *     responses:
 *       200: { description: ITN acknowledged }
 */
router.post("/itn", rawUrlencodedParser, promoteItnRawBody, payfastItn);

router.post("/payfast/itn", rawUrlencodedParser, promoteItnRawBody, payfastItn);

router.post("/webhook", rawBodyParser, promoteRawBody, paystackWebhook);

router.post(
  "/paystack/webhook",
  rawBodyParser,
  promoteRawBody,
  paystackWebhook
);

module.exports = router;
