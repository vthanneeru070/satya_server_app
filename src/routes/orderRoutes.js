const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const validate = require("../middleware/validate");
const {
  checkout,
  createOrder,
  getMyOrders,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  cancelMyOrder,
  updatePayment,
  setTracking,
  dispatchOrder,
  confirmDelivery,
  adminCancelPaidOrder,
  adminInitiateRefund,
  initializePayfast,
  verifyPayfast,
  initializePaystack,
  verifyPaystack,
} = require("../controllers/orderController");
const {
  checkoutOrderSchema,
  createOrderSchema,
  orderIdParamsSchema,
  updateOrderStatusSchema,
  updatePaymentSchema,
  listOrdersQuerySchema,
  adminListOrdersQuerySchema,
  paystackInitSchema,
  paystackVerifySchema,
  payfastInitSchema,
  payfastVerifySchema,
  setTrackingSchema,
  dispatchOrderSchema,
  confirmDeliverySchema,
  adminCancelPaidSchema,
  adminInitiateRefundSchema,
  cancelMyOrderSchema,
} = require("../validations/orderValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Pooja Kit product orders (checkout, PayFast, COD)
 */

/**
 * @swagger
 * /orders/checkout:
 *   post:
 *     summary: Checkout current cart into an unpaid order (PayFast flow)
 *     description: |
 *       Creates order with paymentStatus PENDING from the user's cart.
 *       Does not change inventory until PayFast ITN / verify confirms payment.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [shippingAddress]
 *             properties:
 *               shippingAddress:
 *                 $ref: '#/components/schemas/ShippingAddress'
 *     responses:
 *       201: { description: Order created — proceed to payment initialize }
 */
router.post("/checkout", authenticate, validate(checkoutOrderSchema), checkout);

/**
 * @swagger
 * /orders:
 *   post:
 *     summary: Place an order (from cart or explicit items)
 *     description: |
 *       If `items` is omitted, the order is built from the user's current cart.
 *       Stock is reserved immediately only for COD; PayFast orders reserve stock after ITN confirms payment.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOrderRequest'
 *     responses:
 *       201: { description: Order placed successfully }
 *       400: { description: Cart empty / out of stock / validation error }
 *       409: { description: Stock conflict (concurrent checkout) }
 */
router.post("/", authenticate, validate(createOrderSchema), createOrder);

/**
 * @swagger
 * /orders/my:
 *   get:
 *     summary: List the current user's orders
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PLACED, PROCESSING, SHIPPED, DELIVERED, CANCELLED]
 *       - in: query
 *         name: orderStatus
 *         schema:
 *           type: string
 *           enum: [PLACED, PROCESSING, SHIPPED, DELIVERED, CANCELLED]
 *       - in: query
 *         name: paymentStatus
 *         schema:
 *           type: string
 *           enum: [PENDING, PAID, FAILED, REFUNDED, REFUND_INITIATED, REFUND_FAILED]
 *     responses:
 *       200: { description: Orders fetched successfully }
 */
router.get(
  "/my",
  authenticate,
  validate(listOrdersQuerySchema, "query"),
  getMyOrders
);

/**
 * @swagger
 * /orders/all:
 *   get:
 *     summary: List all orders (admin)
 *     tags: [Orders]
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PLACED, PROCESSING, SHIPPED, DELIVERED, CANCELLED]
 *       - in: query
 *         name: orderStatus
 *         schema:
 *           type: string
 *           enum: [PLACED, PROCESSING, SHIPPED, DELIVERED, CANCELLED]
 *       - in: query
 *         name: paymentStatus
 *         schema:
 *           type: string
 *           enum: [PENDING, PAID, FAILED, REFUNDED, REFUND_INITIATED, REFUND_FAILED]
 *       - in: query
 *         name: user
 *         schema: { type: string, description: User ObjectId }
 *       - in: query
 *         name: search
 *         schema: { type: string, description: Matches orderNumber, order _id, paystackReference, transactionId, Payment reference, or user fullName / email }
 *     responses:
 *       200: { description: Orders fetched successfully }
 *       403: { description: Admin role required }
 */
router.get(
  "/all",
  authenticate,
  authorizeRoles("admin"),
  validate(adminListOrdersQuerySchema, "query"),
  getAllOrders
);

/**
 * @swagger
 * /orders/{id}:
 *   get:
 *     summary: Get an order by id (users see only their own; admins see any)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Order fetched successfully }
 *       404: { description: Order not found }
 */
router.get(
  "/:id",
  authenticate,
  validate(orderIdParamsSchema, "params"),
  getOrderById
);

/**
 * @swagger
 * /orders/{id}/cancel:
 *   post:
 *     summary: Cancel my order before shipment (no admin approval)
 *     description: |
 *       Allowed only while `orderStatus` is **PLACED** or **PROCESSING** (not shipped).
 *       If `paymentStatus` is **PAID**, a PayFast refund is initiated (manual completion in merchant portal).
 *       (`REFUND_INITIATED` or `REFUNDED`). Unpaid orders are cancelled without a refund.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 2000
 *                 example: Ordered by mistake
 *     responses:
 *       200: { description: Order cancelled (refund started if paid) }
 *       400: { description: Order already shipped or refund in progress }
 *       404: { description: Order not found }
 */
router.post(
  "/:id/cancel",
  authenticate,
  validate(orderIdParamsSchema, "params"),
  validate(cancelMyOrderSchema),
  cancelMyOrder
);

/**
 * @swagger
 * /orders/{id}/status:
 *   patch:
 *     summary: Update order status (admin) — follows the state machine
 *     description: |
 *       Allowed transitions:
 *       - PLACED → PROCESSING | CANCELLED
 *       - PLACED → SHIPPED (only if tracking is already set on the order)
 *       - PROCESSING → SHIPPED | CANCELLED
 *       - SHIPPED → DELIVERED
 *       - DELIVERED / CANCELLED are terminal.
 *
 *       When moving to CANCELLED, stock is restocked if inventory was already deducted (paid or COD).
 *       When moving to DELIVERED, COD payment is auto-marked PAID.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PROCESSING, SHIPPED, DELIVERED, CANCELLED]
 *               note: { type: string, example: "Dispatched via BlueDart, AWB12345" }
 *     responses:
 *       200: { description: Order status updated }
 *       400: { description: Illegal state transition }
 *       403: { description: Admin role required }
 *       404: { description: Order not found }
 */
router.patch(
  "/:id/status",
  authenticate,
  authorizeRoles("admin"),
  validate(orderIdParamsSchema, "params"),
  validate(updateOrderStatusSchema),
  updateOrderStatus
);

/**
 * @swagger
 * /orders/{id}/payment:
 *   patch:
 *     summary: Update payment status / reference / method (admin)
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               paymentStatus:
 *                 type: string
 *                 enum: [PENDING, PAID, FAILED, REFUNDED, REFUND_INITIATED, REFUND_FAILED]
 *               paymentMethod:
 *                 type: string
 *                 enum: [COD, EFT, PAYFAST, PAYSTACK]
 *     responses:
 *       200: { description: Order payment updated }
 *       403: { description: Admin role required }
 *       404: { description: Order not found }
 */
router.patch(
  "/:id/payment",
  authenticate,
  authorizeRoles("admin"),
  validate(orderIdParamsSchema, "params"),
  validate(updatePaymentSchema),
  updatePayment
);

/**
 * @swagger
 * /orders/{id}/payments/payfast/initialize:
 *   post:
 *     summary: Initialize PayFast checkout for this order
 *     description: |
 *       Creates a PayFast transaction for the order's `totalAmount`, persists
 *       the reference on the order, and returns signed `formFields` + `paymentUrl`.
 *       The client POSTs the form to PayFast (WebView). Settlement via ITN +
 *       `GET /payments/verify/:reference`.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               callbackUrl:
 *                 type: string
 *                 format: uri
 *                 description: Override PAYFAST_RETURN_URL for this checkout.
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
  "/:id/payments/payfast/initialize",
  authenticate,
  validate(orderIdParamsSchema, "params"),
  validate(payfastInitSchema),
  initializePayfast
);

/** @deprecated — use POST /orders/:id/payments/payfast/initialize */
router.post(
  "/:id/payments/paystack/initialize",
  authenticate,
  validate(orderIdParamsSchema, "params"),
  validate(paystackInitSchema),
  initializePaystack
);

/**
 * @swagger
 * /orders/{id}/payments/payfast/verify:
 *   post:
 *     summary: Verify PayFast payment for this order
 *     description: |
 *       Poll after WebView return. Idempotent once ITN has marked the order PAID.
 *       Body `{ "reference": "PF-..." }` required.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reference]
 *             properties:
 *               reference:
 *                 type: string
 *                 example: PF-SATYA-10001-A1B2C3
 *     responses:
 *       200: { description: Verification result }
 *       404: { description: No payment matches reference }
 *       409: { description: Payment still pending ITN }
 */
router.post(
  "/:id/payments/payfast/verify",
  authenticate,
  validate(orderIdParamsSchema, "params"),
  validate(payfastVerifySchema),
  verifyPayfast
);

/** @deprecated — use POST /orders/:id/payments/payfast/verify */
router.post(
  "/:id/payments/paystack/verify",
  authenticate,
  validate(orderIdParamsSchema, "params"),
  validate(paystackVerifySchema),
  verifyPaystack
);

/**
 * @swagger
 * /orders/{id}/tracking:
 *   patch:
 *     summary: Set courier / tracking details for an order (admin)
 *     description: |
 *       Persists `tracking.courier`, `tracking.trackingNumber`, optional
 *       `tracking.trackingUrl`. Required before transitioning the order to
 *       SHIPPED — the `status` endpoint will refuse otherwise.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [courier, trackingNumber]
 *             properties:
 *               courier:        { type: string, example: "The Courier Guy" }
 *               trackingNumber: { type: string, example: "CG123456789" }
 *               trackingUrl:    { type: string, format: uri }
 *     responses:
 *       200: { description: Tracking saved }
 *       400: { description: Invalid payload / order already cancelled }
 *       403: { description: Admin role required }
 *       404: { description: Order not found }
 */
router.patch(
  "/:id/tracking",
  authenticate,
  authorizeRoles("admin"),
  validate(orderIdParamsSchema, "params"),
  validate(setTrackingSchema),
  setTracking
);

/**
 * @swagger
 * /orders/{id}/dispatch:
 *   post:
 *     summary: Set tracking and mark the order SHIPPED in one call (admin)
 *     description: |
 *       Convenience endpoint combining `PATCH /tracking` + `PATCH /status` with
 *       `status: SHIPPED`. Sends the "your order is on its way" email.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [courier, trackingNumber]
 *             properties:
 *               courier:        { type: string }
 *               trackingNumber: { type: string }
 *               trackingUrl:    { type: string, format: uri }
 *               note:           { type: string, maxLength: 300 }
 *     responses:
 *       200: { description: Order dispatched (status SHIPPED) }
 *       400: { description: Illegal transition / missing tracking }
 *       403: { description: Admin role required }
 *       404: { description: Order not found }
 */
router.post(
  "/:id/dispatch",
  authenticate,
  authorizeRoles("admin"),
  validate(orderIdParamsSchema, "params"),
  validate(dispatchOrderSchema),
  dispatchOrder
);

/**
 * @swagger
 * /orders/{id}/confirm-delivery:
 *   post:
 *     summary: Customer confirms (or rejects) delivery (BRS "satisfied?" branch)
 *     description: |
 *       `satisfied: true` flips the order to terminal `FULFILLED`.
 *       `satisfied: false` records dissatisfaction; the client should
 *       prompt the user to open a refund/replacement request next.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [satisfied]
 *             properties:
 *               satisfied: { type: boolean }
 *               feedback:  { type: string, maxLength: 2000 }
 *     responses:
 *       200: { description: Delivery confirmation recorded }
 *       400: { description: Order is not in a deliverable state }
 *       404: { description: Order not found }
 */
router.post(
  "/:id/confirm-delivery",
  authenticate,
  validate(orderIdParamsSchema, "params"),
  validate(confirmDeliverySchema),
  confirmDelivery
);

/**
 * @swagger
 * /orders/{id}/cancel-paid:
 *   post:
 *     summary: Admin terminal cancel of a paid (or unshipped) order
 *     description: |
 *       Used when admin approves a CANCELLATION request out-of-band. Restocks
 *       items if inventory was deducted. For **NORMAL** paid orders, initiates a
 *       PayFast refund (complete manually in merchant portal). **REPLACEMENT**
 *       orders are cancelled without refund (they reuse the original charge).
 *       Disallowed once the order is SHIPPED or beyond.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, maxLength: 2000 }
 *     responses:
 *       200: { description: Order cancelled }
 *       400: { description: Order already shipped / delivered / cancelled }
 *       403: { description: Admin role required }
 *       404: { description: Order not found }
 */
router.post(
  "/:id/cancel-paid",
  authenticate,
  authorizeRoles("admin"),
  validate(orderIdParamsSchema, "params"),
  validate(adminCancelPaidSchema),
  adminCancelPaidOrder
);

/**
 * @swagger
 * /orders/{id}/refund:
 *   post:
 *     summary: Admin initiate PayFast refund (no user request)
 *     description: |
 *       Full refund for a **PAID** PayFast order. Sets `REFUND_INITIATED` — admin
 *       must complete the refund in the PayFast merchant portal, then update order
 *       payment status. Does not change `orderStatus`.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, maxLength: 2000 }
 *               adminNote: { type: string, maxLength: 2000 }
 *     responses:
 *       200: { description: Refund initiated or completed }
 *       400: { description: Invalid payment state / replacement order }
 *       403: { description: Admin role required }
 *       404: { description: Order not found }
 */
router.post(
  "/:id/refund",
  authenticate,
  authorizeRoles("admin"),
  validate(orderIdParamsSchema, "params"),
  validate(adminInitiateRefundSchema),
  adminInitiateRefund
);

module.exports = router;
