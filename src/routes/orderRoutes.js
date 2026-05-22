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
  setTrackingSchema,
  dispatchOrderSchema,
  confirmDeliverySchema,
  adminCancelPaidSchema,
} = require("../validations/orderValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Pooja Kit product orders (checkout, Paystack, COD)
 */

/**
 * @swagger
 * /orders/checkout:
 *   post:
 *     summary: Checkout current cart into an unpaid order (Paystack flow)
 *     description: |
 *       Creates order with paymentStatus PENDING from the user's cart.
 *       Does not change inventory until Paystack verification succeeds.
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
 *       Stock is reserved immediately only for COD; Paystack orders reserve stock after successful payment verification.
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
 *         schema: { type: string, description: Substring match against orderNumber }
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
 *       If `paymentStatus` is **PAID**, a full Paystack refund is initiated automatically
 *       (`REFUND_INITIATED` or `REFUNDED`). Unpaid orders are cancelled without a refund.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Order cancelled (refund started if paid) }
 *       400: { description: Order already shipped or refund in progress }
 *       404: { description: Order not found }
 */
router.post(
  "/:id/cancel",
  authenticate,
  validate(orderIdParamsSchema, "params"),
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
 *                 enum: [COD, EFT, PAYSTACK]
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
 * /orders/{id}/payments/paystack/initialize:
 *   post:
 *     summary: Initialize a Paystack transaction for this order
 *     description: |
 *       Creates a Paystack transaction tied to the order's `totalAmount` and
 *       `currency`, persists the returned reference / access code / authorization
 *       URL on the order, and returns them to the client. The frontend can then:
 *         - Use `accessCode` with the Flutter Paystack SDK / Inline popup, OR
 *         - Open `authorizationUrl` in a webview.
 *       Safe to call multiple times — the same reference is reused on retries.
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
 *                 description: Override the global PAYSTACK_CALLBACK_URL for this transaction.
 *     responses:
 *       200:
 *         description: Paystack transaction initialized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     reference: { type: string }
 *                     accessCode: { type: string }
 *                     authorizationUrl: { type: string, format: uri }
 *                     publicKey: { type: string, nullable: true }
 *                     amount: { type: number }
 *                     currency: { type: string, example: ZAR }
 *                     email: { type: string }
 *       400: { description: Order already paid / unsupported currency / missing email }
 *       404: { description: Order not found }
 *       500: { description: Paystack not configured on the server }
 */
router.post(
  "/:id/payments/paystack/initialize",
  authenticate,
  validate(orderIdParamsSchema, "params"),
  validate(paystackInitSchema),
  initializePaystack
);

/**
 * @swagger
 * /orders/{id}/payments/paystack/verify:
 *   post:
 *     summary: Manually verify a Paystack transaction for this order
 *     description: |
 *       Call this after the user completes (or abandons) payment in the
 *       Paystack popup / webview. The server re-checks the transaction against
 *       Paystack's API and flips the order to PAID on success. Idempotent.
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
 *                 description: The Paystack reference returned by initialize.
 *     responses:
 *       200: { description: Verification result }
 *       404: { description: No order matches reference }
 *       409: { description: Amount or currency mismatch }
 */
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
 *       items if inventory was deducted. For **NORMAL** paid orders, triggers a full
 *       Paystack refund. **REPLACEMENT** orders are cancelled without refund (they
 *       reuse the original charge; refund the original order only if needed).
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

module.exports = router;
