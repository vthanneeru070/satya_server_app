const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const validate = require("../middleware/validate");
const {
  initializePayment,
  verifyPayment,
  listAllPayments,
} = require("../controllers/paymentController");
const {
  paymentInitializeSchema,
  paymentVerifyParamsSchema,
  listAllPaymentsQuerySchema,
} = require("../validations/paymentValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Paystack payments for orders and donations
 */

/**
 * @swagger
 * /payments/all:
 *   get:
 *     summary: List all Paystack payments (admin)
 *     description: |
 *       Paginated list of Payment records. Use `search` or `reference` for
 *       case-insensitive substring match on Paystack reference.
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Substring match on payment reference (alias `reference`)
 *       - in: query
 *         name: reference
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, SUCCESS, FAILED]
 *       - in: query
 *         name: paymentFor
 *         schema:
 *           type: string
 *           enum: [ORDER, DONATION]
 *       - in: query
 *         name: user
 *         schema: { type: string, description: User ObjectId }
 *       - in: query
 *         name: order
 *         schema: { type: string, description: Order ObjectId }
 *     responses:
 *       200:
 *         description: Payments fetched successfully
 *       403:
 *         description: Admin role required
 */
router.get(
  "/all",
  authenticate,
  authorizeRoles("admin"),
  validate(listAllPaymentsQuerySchema, "query"),
  listAllPayments
);

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
