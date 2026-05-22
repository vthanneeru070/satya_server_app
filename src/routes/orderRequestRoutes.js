const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const validate = require("../middleware/validate");
const {
  createRequest,
  listMyRequests,
  listAllRequests,
  getRequestById,
  approveRequest,
  rejectRequest,
} = require("../controllers/orderRequestController");
const {
  createRequestSchema,
  decideRequestSchema,
  requestIdParamsSchema,
  orderIdParamsSchema,
  listRequestsQuerySchema,
} = require("../validations/orderRequestValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Order Requests
 *   description: |
 *     Post-delivery **REFUND** requests. Pre-shipment cancel uses `POST /orders/{id}/cancel` (immediate).
 */

/**
 * @swagger
 * /orders/requests/my:
 *   get:
 *     summary: List the current user's order requests
 *     tags: [Order Requests]
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
 *         schema: { type: string, enum: [PENDING, APPROVED, REJECTED, COMPLETED] }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [CANCELLATION, REFUND] }
 *     responses:
 *       200: { description: Requests fetched successfully }
 */
router.get(
  "/requests/my",
  authenticate,
  validate(listRequestsQuerySchema, "query"),
  listMyRequests
);

/**
 * @swagger
 * /orders/requests:
 *   get:
 *     summary: List all order requests (admin)
 *     tags: [Order Requests]
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
 *         schema: { type: string, enum: [PENDING, APPROVED, REJECTED, COMPLETED] }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [CANCELLATION, REFUND] }
 *       - in: query
 *         name: user
 *         schema: { type: string }
 *     responses:
 *       200: { description: Requests fetched successfully }
 *       403: { description: Admin role required }
 */
router.get(
  "/requests",
  authenticate,
  authorizeRoles("admin"),
  validate(listRequestsQuerySchema, "query"),
  listAllRequests
);

/**
 * @swagger
 * /orders/requests/{requestId}:
 *   get:
 *     summary: Get a single order request (owner or admin)
 *     tags: [Order Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Request fetched successfully }
 *       404: { description: Request not found }
 */
router.get(
  "/requests/:requestId",
  authenticate,
  validate(requestIdParamsSchema, "params"),
  getRequestById
);

/**
 * @swagger
 * /orders/requests/{requestId}/approve:
 *   post:
 *     summary: Approve an order request (admin)
 *     description: |
 *       - **CANCELLATION** → cancels the order (restocks; Paystack refund outcome sets `paymentStatus` to REFUNDED, REFUND_INITIATED, or REFUND_FAILED).
 *       - **REFUND** → same Paystack full refund; `paymentStatus` reflects immediate vs async vs failed outcome.
 *       Product replacements use **PUT /admin/replacements/:id/approve** instead.
 *     tags: [Order Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               adminNote: { type: string, maxLength: 2000 }
 *     responses:
 *       200: { description: Request approved }
 *       400: { description: Already resolved / cannot apply }
 *       403: { description: Admin role required }
 *       404: { description: Request not found }
 */
router.post(
  "/requests/:requestId/approve",
  authenticate,
  authorizeRoles("admin"),
  validate(requestIdParamsSchema, "params"),
  validate(decideRequestSchema),
  approveRequest
);

/**
 * @swagger
 * /orders/requests/{requestId}/reject:
 *   post:
 *     summary: Reject an order request (admin)
 *     tags: [Order Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               adminNote: { type: string, maxLength: 2000 }
 *     responses:
 *       200: { description: Request rejected }
 *       400: { description: Already resolved }
 *       403: { description: Admin role required }
 *       404: { description: Request not found }
 */
router.post(
  "/requests/:requestId/reject",
  authenticate,
  authorizeRoles("admin"),
  validate(requestIdParamsSchema, "params"),
  validate(decideRequestSchema),
  rejectRequest
);

/**
 * @swagger
 * /orders/{id}/requests:
 *   post:
 *     summary: Open a REFUND request on an order (post-delivery)
 *     description: |
 *       Pre-shipment cancel: `POST /orders/{id}/cancel` (immediate, auto-refund if paid).
 *       **CANCELLATION** type is deprecated for PLACED/PROCESSING — use cancel endpoint.
 *       Replacements: `POST /replacements/request`.
 *     tags: [Order Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, description: Order id }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type]
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [CANCELLATION, REFUND]
 *               reason: { type: string, maxLength: 2000 }
 *               attachments:
 *                 type: array
 *                 items: { type: string, format: uri }
 *                 maxItems: 10
 *     responses:
 *       201: { description: Request submitted }
 *       400: { description: Cannot file this request for the current order state }
 *       404: { description: Order not found }
 *       409: { description: An open request of this type already exists }
 */
router.post(
  "/:id/requests",
  authenticate,
  validate(orderIdParamsSchema, "params"),
  validate(createRequestSchema),
  createRequest
);

module.exports = router;
