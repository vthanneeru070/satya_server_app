const express = require("express");
const authenticate = require("../middleware/authenticate");
const adminMiddleware = require("../middleware/adminMiddleware");
const validate = require("../middleware/validate");
const {
  listAllAdmin,
  getOneAdmin,
  approveAdmin,
  rejectAdmin,
  bookReturnAdmin,
  markReturnReceivedAdmin,
} = require("../controllers/replacementController");
const {
  replacementRequestIdParamsSchema,
  adminListReplacementQuerySchema,
  adminDecideReplacementSchema,
} = require("../validations/replacementValidation");

const router = express.Router();

router.use(authenticate, adminMiddleware);

/**
 * @swagger
 * tags:
 *   name: AdminReplacements
 *   description: Admin replacement request queue
 */

/**
 * @swagger
 * /admin/replacements:
 *   get:
 *     summary: List all replacement requests
 *     tags: [AdminReplacements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [REQUESTED, APPROVED, REJECTED, PROCESSING, SHIPPED, DELIVERED, CANCELLED]
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Matches requestNumber, request _id, orderNumber, order _id, user fullName, or user email
 *     responses:
 *       200: { description: OK }
 */
router.get("/", validate(adminListReplacementQuerySchema, "query"), listAllAdmin);

/**
 * @swagger
 * /admin/replacements/{id}:
 *   get:
 *     summary: Get replacement request (admin)
 *     tags: [AdminReplacements]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/:id",
  validate(replacementRequestIdParamsSchema, "params"),
  getOneAdmin
);

/**
 * @swagger
 * /admin/replacements/{id}/approve:
 *   put:
 *     summary: Approve replacement — creates linked replacement order
 *     tags: [AdminReplacements]
 *     security:
 *       - bearerAuth: []
 */
router.put(
  "/:id/approve",
  validate(replacementRequestIdParamsSchema, "params"),
  validate(adminDecideReplacementSchema),
  approveAdmin
);

/**
 * @swagger
 * /admin/replacements/{id}/reject:
 *   put:
 *     summary: Reject replacement request
 *     tags: [AdminReplacements]
 *     security:
 *       - bearerAuth: []
 */
router.put(
  "/:id/reject",
  validate(replacementRequestIdParamsSchema, "params"),
  validate(adminDecideReplacementSchema),
  rejectAdmin
);

/**
 * @swagger
 * /admin/replacements/{id}/book-return:
 *   post:
 *     summary: Book Courier Guy return collection (delivery orders)
 *     tags: [AdminReplacements]
 */
router.post(
  "/:id/book-return",
  validate(replacementRequestIdParamsSchema, "params"),
  bookReturnAdmin
);

/**
 * @swagger
 * /admin/replacements/{id}/mark-return-received:
 *   post:
 *     summary: Mark damaged item received at warehouse
 *     tags: [AdminReplacements]
 */
router.post(
  "/:id/mark-return-received",
  validate(replacementRequestIdParamsSchema, "params"),
  markReturnReceivedAdmin
);

module.exports = router;
