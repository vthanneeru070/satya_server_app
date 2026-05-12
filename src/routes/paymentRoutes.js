const express = require("express");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const {
  initializePayment,
  verifyPayment,
} = require("../controllers/paymentController");
const {
  paymentInitializeSchema,
  paymentVerifyParamsSchema,
} = require("../validations/paymentValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Paystack payments for orders
 */

/**
 * @swagger
 * /payments/initialize:
 *   post:
 *     summary: Initialize Paystack for an order (creates Payment record)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/initialize",
  authenticate,
  validate(paymentInitializeSchema),
  initializePayment
);

/**
 * @swagger
 * /payments/verify/{reference}:
 *   get:
 *     summary: Verify Paystack payment server-side (idempotent)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/verify/:reference",
  authenticate,
  validate(paymentVerifyParamsSchema, "params"),
  verifyPayment
);

module.exports = router;
