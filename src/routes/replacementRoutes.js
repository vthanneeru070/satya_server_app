const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const validate = require("../middleware/validate");
const upload = require("../middleware/upload");
const {
  createRequest,
  listMyRequests,
  getRequestById,
} = require("../controllers/replacementController");
const {
  createReplacementRequestSchema,
  replacementRequestIdParamsSchema,
  listMyReplacementQuerySchema,
} = require("../validations/replacementValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Replacements
 *   description: Post-delivery replacement requests (Pooja Kit orders)
 */

/**
 * @swagger
 * /replacements/request:
 *   post:
 *     summary: Request a replacement for a delivered paid order
 *     tags: [Replacements]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [orderId, reason]
 *             properties:
 *               orderId: { type: string }
 *               reason: { type: string }
 *               imageUrls: { type: string, description: "JSON array of image URLs (optional)" }
 *               images: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 *       401: { description: Unauthorized }
 *       409: { description: Duplicate or active replacement in progress }
 */
router.post(
  "/request",
  authenticate,
  authorizeRoles("user"),
  upload.array("images", 8),
  validate(createReplacementRequestSchema),
  createRequest
);

/**
 * @swagger
 * /replacements/my-requests:
 *   get:
 *     summary: List my replacement requests
 *     tags: [Replacements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, APPROVED, REJECTED, COMPLETED]
 *     responses:
 *       200: { description: OK }
 */
router.get(
  "/my-requests",
  authenticate,
  authorizeRoles("user"),
  validate(listMyReplacementQuerySchema, "query"),
  listMyRequests
);

/**
 * @swagger
 * /replacements/{id}:
 *   get:
 *     summary: Get one replacement request (owner)
 *     tags: [Replacements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Not found }
 */
router.get(
  "/:id",
  authenticate,
  authorizeRoles("user"),
  validate(replacementRequestIdParamsSchema, "params"),
  getRequestById
);

module.exports = router;
