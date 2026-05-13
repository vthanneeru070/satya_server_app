const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const authorizeSuperAdmin = require("../middleware/authorizeSuperAdmin");
const validate = require("../middleware/validate");
const upload = require("../middleware/upload");
const {
  createRitual,
  getRituals,
  getAllRituals,
  getMyRituals,
  getRitualById,
  updateRitual,
  deleteRitual,
  reviewRitual,
} = require("../controllers/ritualController");
const {
  createRitualSchema,
  updateRitualSchema,
  reviewRitualSchema,
  ritualIdParamsSchema,
  allRitualsQuerySchema,
} = require("../validations/ritualValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Rituals
 *   description: Ritual management APIs (same structure as Poojas)
 */

/**
 * @swagger
 * /rituals/create-ritual:
 *   post:
 *     summary: Create ritual
 *     description: Requires admin role. Multipart with optional image/audio/video files.
 *     tags: [Rituals]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/RitualCreateMultipart'
 *     responses:
 *       201:
 *         description: Ritual created successfully
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin role required)
 */
router.post(
  "/create-ritual",
  authenticate,
  authorizeRoles("admin"),
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "audio", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  validate(createRitualSchema),
  createRitual
);

/**
 * @swagger
 * /rituals:
 *   get:
 *     summary: Get rituals
 *     tags: [Rituals]
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
 *           enum: [DRAFT, PENDING, APPROVED, REJECTED]
 *     responses:
 *       200:
 *         description: Rituals fetched successfully
 */
router.get("/", authenticate, validate(allRitualsQuerySchema, "query"), getRituals);

/**
 * @swagger
 * /rituals/my:
 *   get:
 *     summary: Get my rituals
 *     description: Requires admin role. Rituals created by the logged-in user.
 *     tags: [Rituals]
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
 *           enum: [DRAFT, PENDING, APPROVED, REJECTED]
 *     responses:
 *       200:
 *         description: My rituals fetched successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin role required)
 */
router.get(
  "/my",
  authenticate,
  authorizeRoles("admin"),
  validate(allRitualsQuerySchema, "query"),
  getMyRituals
);

/**
 * @swagger
 * /rituals/all:
 *   get:
 *     summary: Get all rituals (all statuses)
 *     description: Requires super admin role.
 *     tags: [Rituals]
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
 *           enum: [DRAFT, PENDING, APPROVED, REJECTED]
 *     responses:
 *       200:
 *         description: All rituals fetched successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (super admin required)
 */
router.get(
  "/all",
  authenticate,
  authorizeSuperAdmin,
  validate(allRitualsQuerySchema, "query"),
  getAllRituals
);

/**
 * @swagger
 * /rituals/{id}:
 *   get:
 *     summary: Get ritual by id
 *     tags: [Rituals]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ritual fetched successfully
 *       404:
 *         description: Ritual not found
 */
router.get("/:id", authenticate, validate(ritualIdParamsSchema, "params"), getRitualById);

/**
 * @swagger
 * /rituals/{id}:
 *   patch:
 *     summary: Update ritual
 *     description: Requires admin role.
 *     tags: [Rituals]
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
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/RitualUpdateMultipart'
 *     responses:
 *       200:
 *         description: Ritual updated successfully
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin role required)
 *       404:
 *         description: Ritual not found
 */
router.patch(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "audio", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  validate(ritualIdParamsSchema, "params"),
  validate(updateRitualSchema),
  updateRitual
);

/**
 * @swagger
 * /rituals/{id}:
 *   delete:
 *     summary: Delete ritual
 *     description: Requires admin role. Deletes ritual and removes uploaded media from storage.
 *     tags: [Rituals]
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
 *         description: Ritual deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin role required)
 *       404:
 *         description: Ritual not found
 */
router.delete(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  validate(ritualIdParamsSchema, "params"),
  deleteRitual
);

/**
 * @swagger
 * /rituals/review/{id}:
 *   put:
 *     summary: Review ritual
 *     description: Requires super admin role.
 *     tags: [Rituals]
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
 *                 enum: [APPROVED, REJECTED, DRAFT, PENDING]
 *     responses:
 *       200:
 *         description: Ritual reviewed successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (super admin required)
 *       404:
 *         description: Ritual not found
 */
router.put(
  "/review/:id",
  authenticate,
  authorizeSuperAdmin,
  validate(ritualIdParamsSchema, "params"),
  validate(reviewRitualSchema),
  reviewRitual
);

module.exports = router;
