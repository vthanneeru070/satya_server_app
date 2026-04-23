const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const authorizeSuperAdmin = require("../middleware/authorizeSuperAdmin");
const validate = require("../middleware/validate");
const upload = require("../middleware/upload");
const {
  createPooja,
  getPoojas,
  getAllPoojas,
  getMyPoojas,
  getPoojaById,
  updatePooja,
  deletePooja,
  reviewPooja,
} = require("../controllers/poojaController");
const {
  createPoojaSchema,
  updatePoojaSchema,
  reviewPoojaSchema,
  poojaIdParamsSchema,
  allPoojasQuerySchema,
} = require("../validations/poojaValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Poojas
 *   description: Pooja management APIs
 */

/**
 * @swagger
 * /poojas/create-pooja:
 *   post:
 *     summary: Create pooja
 *     description: Requires admin role. Upload pooja with image/audio/video and details.
 *     tags: [Poojas]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, deity, category, difficulty, duration, description, status]
 *             properties:
 *               title:
 *                 type: string
 *               deity:
 *                 type: string
 *               category:
 *                 type: string
 *               difficulty:
 *                 type: string
 *               duration:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *               audio:
 *                 type: string
 *                 format: binary
 *               video:
 *                 type: string
 *                 format: binary
 *               steps:
 *                 type: string
 *               requiredItems:
 *                 type: string
 *               festivalIds:
 *                 type: string
 *               rating:
 *                 type: number
 *     responses:
 *       201:
 *         description: Pooja created successfully
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin role required)
 */
router.post(
  "/create-pooja",
  authenticate,
  authorizeRoles("admin"),
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "audio", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  validate(createPoojaSchema),
  createPooja
);

/**
 * @swagger
 * /poojas:
 *   get:
 *     summary: Get all poojas
 *     tags: [Poojas]
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
 *         description: Poojas fetched successfully
 */
router.get("/", authenticate, validate(allPoojasQuerySchema, "query"), getPoojas);

/**
 * @swagger
 * /poojas/my:
 *   get:
 *     summary: Get my poojas
 *     description: Requires admin role. Returns poojas created by logged-in admin/super admin.
 *     tags: [Poojas]
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
 *         description: My poojas fetched successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin role required)
 */
router.get(
  "/my",
  authenticate,
  authorizeRoles("admin"),
  validate(allPoojasQuerySchema, "query"),
  getMyPoojas
);

/**
 * @swagger
 * /poojas/all:
 *   get:
 *     summary: Get all poojas (all statuses)
 *     description: Requires super admin role.
 *     tags: [Poojas]
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
 *         description: All poojas fetched successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (super admin required)
 */
router.get("/all", authenticate, authorizeSuperAdmin, validate(allPoojasQuerySchema, "query"), getAllPoojas);

/**
 * @swagger
 * /poojas/{id}:
 *   get:
 *     summary: Get pooja by id
 *     tags: [Poojas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pooja fetched successfully
 *       404:
 *         description: Pooja not found
 */
router.get("/:id", authenticate, validate(poojaIdParamsSchema, "params"), getPoojaById);

/**
 * @swagger
 * /poojas/{id}:
 *   patch:
 *     summary: Update pooja
 *     description: Requires admin role. Update pooja fields and optionally replace image/audio/video.
 *     tags: [Poojas]
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
 *               title:
 *                 type: string
 *               deity:
 *                 type: string
 *               category:
 *                 type: string
 *               difficulty:
 *                 type: string
 *               duration:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *               audio:
 *                 type: string
 *                 format: binary
 *               video:
 *                 type: string
 *                 format: binary
 *               steps:
 *                 type: string
 *               requiredItems:
 *                 type: string
 *               rating:
 *                 type: number
 *     responses:
 *       200:
 *         description: Pooja updated successfully
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin role required)
 *       404:
 *         description: Pooja not found
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
  validate(poojaIdParamsSchema, "params"),
  validate(updatePoojaSchema),
  updatePooja
);

/**
 * @swagger
 * /poojas/{id}:
 *   delete:
 *     summary: Delete pooja
 *     description: Requires admin role. Permanently deletes pooja and its image.
 *     tags: [Poojas]
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
 *         description: Pooja deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (admin role required)
 *       404:
 *         description: Pooja not found
 */
router.delete(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  validate(poojaIdParamsSchema, "params"),
  deletePooja
);

/**
 * @swagger
 * /poojas/review/{id}:
 *   put:
 *     summary: Review pooja
 *     description: Requires super admin role. Set pooja status to APPROVED or REJECTED.
 *     tags: [Poojas]
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
 *                 enum: [APPROVED, REJECTED]
 *     responses:
 *       200:
 *         description: Pooja reviewed successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (super admin required)
 *       404:
 *         description: Pooja not found
 */
router.put(
  "/review/:id",
  authenticate,
  authorizeSuperAdmin,
  validate(poojaIdParamsSchema, "params"),
  validate(reviewPoojaSchema),
  reviewPooja
);

module.exports = router;
