const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const authorizeSuperAdmin = require("../middleware/authorizeSuperAdmin");
const validate = require("../middleware/validate");
const {
  createDeity,
  getAllDeities,
  updateDeity,
  deleteDeity,
  reviewDeity,
} = require("../controllers/deityController");
const {
  createDeitySchema,
  updateDeitySchema,
  deityIdParamsSchema,
  allDeitiesQuerySchema,
  reviewDeitySchema,
} = require("../validations/deityValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Deities
 *   description: Deity management APIs
 */

/**
 * @swagger
 * /deities/create-deity:
 *   post:
 *     summary: Create deity
 *     description: Requires admin role.
 *     tags: [Deities]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               alternate_names:
 *                 type: array
 *                 items:
 *                   type: string
 *               description:
 *                 type: string
 *               roles:
 *                 type: array
 *                 items:
 *                   type: string
 *               sections:
 *                 type: array
 *                 items:
 *                   type: object
 *               rituals:
 *                 type: array
 *                 items:
 *                   type: string
 *               media:
 *                 type: object
 *                 properties:
 *                   images:
 *                     type: array
 *                     items:
 *                       type: string
 *                   audio:
 *                     type: array
 *                     items:
 *                       type: string
 *                   videos:
 *                     type: array
 *                     items:
 *                       type: string
 *     responses:
 *       201:
 *         description: Deity created successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin role required)
 */
router.post(
  "/create-deity",
  authenticate,
  authorizeRoles("admin"),
  validate(createDeitySchema),
  createDeity
);

/**
 * @swagger
 * /deities:
 *   get:
 *     summary: Get all deities
 *     tags: [Deities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, PENDING, APPROVED, REJECTED, QUEUED]
 *     responses:
 *       200:
 *         description: Deities fetched successfully
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/",
  authenticate,
  authorizeSuperAdmin,
  validate(allDeitiesQuerySchema, "query"),
  getAllDeities
);

/**
 * @swagger
 * /deities/{id}:
 *   patch:
 *     summary: Update deity
 *     description: Requires admin role.
 *     tags: [Deities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               alternate_names:
 *                 type: array
 *                 items:
 *                   type: string
 *               description:
 *                 type: string
 *               roles:
 *                 type: array
 *                 items:
 *                   type: string
 *               sections:
 *                 type: array
 *                 items:
 *                   type: object
 *               rituals:
 *                 type: array
 *                 items:
 *                   type: string
 *               media:
 *                 type: object
 *     responses:
 *       200:
 *         description: Deity updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin role required)
 *       404:
 *         description: Deity not found
 */
router.patch(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  validate(deityIdParamsSchema, "params"),
  validate(updateDeitySchema),
  updateDeity
);

/**
 * @swagger
 * /deities/{id}:
 *   delete:
 *     summary: Delete deity
 *     description: Requires admin role.
 *     tags: [Deities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deity deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin role required)
 *       404:
 *         description: Deity not found
 */
router.delete(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  validate(deityIdParamsSchema, "params"),
  deleteDeity
);

/**
 * @swagger
 * /deities/review/{id}:
 *   put:
 *     summary: Review deity
 *     description: Requires super admin role. Set deity status.
 *     tags: [Deities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
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
 *                 enum: [APPROVED, REJECTED, QUEUED, DRAFT]
 *     responses:
 *       200:
 *         description: Deity reviewed successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (super admin role required)
 *       404:
 *         description: Deity not found
 */
router.put(
  "/review/:id",
  authenticate,
  authorizeSuperAdmin,
  validate(deityIdParamsSchema, "params"),
  validate(reviewDeitySchema),
  reviewDeity
);

module.exports = router;
