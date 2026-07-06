const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const authorizeSuperAdmin = require("../middleware/authorizeSuperAdmin");
const validate = require("../middleware/validate");
const upload = require("../middleware/upload");
const {
  createDeity,
  getAllDeities,
  getDeities,
  getDeityById,
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
 *     description: Requires admin role. Accepts multipart/form-data with optional image/audio/video files. Nested fields can be sent as JSON strings.
 *     tags: [Deities]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               deity_color: { type: string, description: "Hex color e.g. #FF5733", example: "#FF5733" }
 *               alternate_names: { type: string, description: "JSON array string e.g. [\"Mahalakshmi\",\"Shri\"]" }
 *               roles: { type: string, description: "JSON array string" }
 *               lineage: { type: string, description: "JSON object string" }
 *               structure: { type: string, description: "JSON array string of {title, description}" }
 *               appearance: { type: string, description: "JSON array string of {title, description}" }
 *               spiritual_significance: { type: string, description: "JSON array string of {title, description}" }
 *               connecting: { type: string, description: "JSON object string" }
 *               chanting: { type: string, description: "JSON object string" }
 *               home_practice: { type: string, description: "JSON object string" }
 *               devotional_experience: { type: string, description: "JSON object string" }
 *               stories: { type: string, description: "JSON array string" }
 *               pujas: { type: string, description: "Pooja ObjectId comma list or JSON array string" }
 *               media: { type: string, description: "JSON object string with images/audio/videos" }
 *               status:
 *                 type: string
 *                 enum: [DRAFT, PENDING, APPROVED, REJECTED, QUEUED]
 *               image: { type: string, format: binary }
 *               audio: { type: string, format: binary }
 *               video: { type: string, format: binary }
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
  upload.fields([
    { name: "image", maxCount: 5 },
    { name: "audio", maxCount: 5 },
    { name: "video", maxCount: 5 },
  ]),
  validate(createDeitySchema),
  createDeity
);

/**
 * @swagger
 * /deities/all:
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
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, description, alternate names, or roles
 *     responses:
 *       200:
 *         description: Deities fetched successfully
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/all",
  authenticate,
  authorizeRoles("admin"),
  validate(allDeitiesQuerySchema, "query"),
  getAllDeities
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
 *     responses:
 *       200:
 *         description: Deities fetched successfully
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/",
  authenticate,
  validate(allDeitiesQuerySchema, "query"),
  getDeities
);

/**
 * @swagger
 * /deities/{id}:
 *   get:
 *     summary: Get deity by ID
 *     description: Returns deity details by ID. Non-admin users can access approved deities only.
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
 *         description: Deity fetched successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Deity not found
 */
router.get(
  "/:id",
  authenticate,
  validate(deityIdParamsSchema, "params"),
  getDeityById
);

/**
 * @swagger
 * /deities/{id}:
 *   patch:
 *     summary: Update deity
 *     description: Requires admin role. Accepts multipart/form-data with optional image/audio/video files. Nested fields can be sent as JSON strings.
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               deity_color: { type: string, description: "Hex color e.g. #FF5733", example: "#FF5733" }
 *               alternate_names: { type: string, description: "JSON array string" }
 *               roles: { type: string, description: "JSON array string" }
 *               lineage: { type: string, description: "JSON object string" }
 *               structure: { type: string, description: "JSON array string" }
 *               appearance: { type: string, description: "JSON array string" }
 *               spiritual_significance: { type: string, description: "JSON array string" }
 *               connecting: { type: string, description: "JSON object string" }
 *               chanting: { type: string, description: "JSON object string" }
 *               home_practice: { type: string, description: "JSON object string" }
 *               devotional_experience: { type: string, description: "JSON object string" }
 *               stories: { type: string, description: "JSON array string" }
 *               pujas: { type: string, description: "Pooja ObjectId comma list or JSON array string" }
 *               media: { type: string, description: "JSON object string with images/audio/videos" }
 *               status:
 *                 type: string
 *                 enum: [DRAFT, PENDING, APPROVED, REJECTED, QUEUED]
 *               image: { type: string, format: binary }
 *               audio: { type: string, format: binary }
 *               video: { type: string, format: binary }
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
  upload.fields([
    { name: "image", maxCount: 5 },
    { name: "audio", maxCount: 5 },
    { name: "video", maxCount: 5 },
  ]),
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
