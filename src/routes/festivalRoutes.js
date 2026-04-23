const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const authorizeSuperAdmin = require("../middleware/authorizeSuperAdmin");
const validate = require("../middleware/validate");
const upload = require("../middleware/upload");
const {
  createFestival,
  getMyFestivals,
  getAllFestivals,
  getVisibleFestivals,
  updateFestival,
  deleteFestival,
  reviewFestival,
} = require("../controllers/festivalController");
const {
  createFestivalSchema,
  updateFestivalSchema,
  reviewFestivalSchema,
  festivalIdParamsSchema,
  allFestivalsQuerySchema,
} = require("../validations/festivalValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Festivals
 *   description: Festival management APIs
 */

/**
 * @swagger
 * /festivals:
 *   get:
 *     summary: Get approved and visible festivals
 *     tags: [Festivals]
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
 *         description: Approved festivals fetched successfully
 */
router.get("/", authenticate, validate(allFestivalsQuerySchema, "query"), getVisibleFestivals);

/**
 * @swagger
 * /festivals/create-festival:
 *   post:
 *     summary: Create festival
 *     description: Requires admin role. Festival is created as pending and hidden until review.
 *     tags: [Festivals]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, date]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               date:
 *                 type: string
 *                 example: 26-04-2026
 *               endDate:
 *                 type: string
 *                 example: 27-04-2026
 *               category:
 *                 type: string
 *                 enum: [MAJOR, MINOR, FASTING, ECLIPSE]
 *               isGlobal:
 *                 type: boolean
 *               location:
 *                 type: string
 *               notifyUsers:
 *                 type: boolean
 *               notificationDaysBefore:
 *                 type: number
 *               rituals:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Festival created successfully
 */
router.post(
  "/create-festival",
  authenticate,
  authorizeRoles("admin"),
  upload.single("image"),
  validate(createFestivalSchema),
  createFestival
);

/**
 * @swagger
 * /festivals/my:
 *   get:
 *     summary: Get my festivals
 *     description: Requires admin role.
 *     tags: [Festivals]
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
 *         description: My festivals fetched successfully
 */
router.get(
  "/my",
  authenticate,
  authorizeRoles("admin"),
  validate(allFestivalsQuerySchema, "query"),
  getMyFestivals
);

/**
 * @swagger
 * /festivals/all:
 *   get:
 *     summary: Get all festivals
 *     description: Requires super admin.
 *     tags: [Festivals]
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
 *         description: All festivals fetched successfully
 */
router.get(
  "/all",
  authenticate,
  authorizeSuperAdmin,
  validate(allFestivalsQuerySchema, "query"),
  getAllFestivals
);

/**
 * @swagger
 * /festivals/{id}:
 *   patch:
 *     summary: Update festival
 *     description: Requires admin role. Festival is moved back to pending after update.
 *     tags: [Festivals]
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
 *               description:
 *                 type: string
 *               date:
 *                 type: string
 *                 example: 26-04-2026
 *               endDate:
 *                 type: string
 *                 example: 27-04-2026
 *               category:
 *                 type: string
 *                 enum: [MAJOR, MINOR, FASTING, ECLIPSE]
 *               isGlobal:
 *                 type: boolean
 *               location:
 *                 type: string
 *               notifyUsers:
 *                 type: boolean
 *               notificationDaysBefore:
 *                 type: number
 *               rituals:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Festival updated successfully
 */
router.patch(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  upload.single("image"),
  validate(festivalIdParamsSchema, "params"),
  validate(updateFestivalSchema),
  updateFestival
);

/**
 * @swagger
 * /festivals/{id}:
 *   delete:
 *     summary: Delete festival
 *     description: Requires admin role.
 *     tags: [Festivals]
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
 *         description: Festival deleted successfully
 */
router.delete(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  validate(festivalIdParamsSchema, "params"),
  deleteFestival
);

/**
 * @swagger
 * /festivals/review/{id}:
 *   put:
 *     summary: Review festival
 *     description: Requires super admin. Set festival status to APPROVED or REJECTED.
 *     tags: [Festivals]
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
 *         description: Festival reviewed successfully
 */
router.put(
  "/review/:id",
  authenticate,
  authorizeSuperAdmin,
  validate(festivalIdParamsSchema, "params"),
  validate(reviewFestivalSchema),
  reviewFestival
);

module.exports = router;
