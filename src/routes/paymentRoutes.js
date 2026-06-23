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
 *   description: PayFast payments for orders and donations
 */

/**
 * @swagger
 * /payments/all:
 *   get:
 *     summary: List all payments (admin)
 *     description: |
 *       Paginated list of Payment records. Use `search` or `reference` for
 *       case-insensitive substring match on the payment reference (m_payment_id).
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
 *         name: gateway
 *         schema:
 *           type: string
 *           enum: [PAYFAST, PAYSTACK]
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
 *     summary: Initialize PayFast checkout for an order
 *     description: |
 *       Creates a PENDING Payment record and returns signed PayFast form fields.
 *       The client must POST `formFields` to `paymentUrl` (or open `authorizationUrl`).
 *       Settlement happens via PayFast ITN (`POST /payments/itn`) and can be polled
 *       with `GET /payments/verify/:reference`.
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orderId]
 *             properties:
 *               orderId:
 *                 type: string
 *                 description: Order ObjectId
 *               callbackUrl:
 *                 type: string
 *                 format: uri
 *                 description: Override PAYFAST_RETURN_URL for this checkout
 *     responses:
 *       200:
 *         description: PayFast checkout initialized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 data:
 *                   $ref: '#/components/schemas/PayfastInitResponse'
 *       400: { description: Order already paid / missing email }
 *       404: { description: Order not found }
 *       500: { description: PayFast not configured }
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
 *     summary: Verify PayFast payment (idempotent)
 *     description: |
 *       Returns SUCCESS/FAILED once PayFast ITN has settled the payment. If ITN
 *       has not arrived yet, responds 409 with a pending message — retry after 1–2s.
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *           example: PF-SATYA-10001-A1B2C3
 *     responses:
 *       200: { description: Payment verified or already settled }
 *       404: { description: No payment matches reference }
 *       409: { description: Payment still pending PayFast ITN }
 */
router.get(
  "/verify/:reference",
  authenticate,
  validate(paymentVerifyParamsSchema, "params"),
  verifyPayment
);

module.exports = router;
