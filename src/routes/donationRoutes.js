const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const authorizeSuperAdmin = require("../middleware/authorizeSuperAdmin");
const validate = require("../middleware/validate");
const uploadDonationImage = require("../middleware/uploadDonationImage");
const {
  createDonation,
  updateDonation,
  deleteDonation,
  getMyDonations,
  getAllDonations,
  reviewDonation,
  getVisibleDonations,
} = require("../controllers/donationController");
const {
  createDonationSchema,
  updateDonationSchema,
  reviewDonationSchema,
  donationIdParamsSchema,
} = require("../validations/donationValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Donations
 *   description: Donation management APIs
 */

/**
 * @swagger
 * /donations:
 *   get:
 *     summary: Get approved and visible donations
 *     tags: [Donations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Approved donations fetched successfully
 */
router.get("/", authenticate, getVisibleDonations);

/**
 * @swagger
 * /donations/create-donation:
 *   post:
 *     summary: Create donation
 *     description: Requires admin role. New donation is created as pending and not visible.
 *     tags: [Donations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, image]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Donation created successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post(
  "/create-donation",
  authenticate,
  authorizeRoles("admin"),
  uploadDonationImage.single("image"),
  validate(createDonationSchema),
  createDonation
);

/**
 * @swagger
 * /donations/my:
 *   get:
 *     summary: Get my donations
 *     description: Requires admin role.
 *     tags: [Donations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: My donations fetched successfully
 */
router.get("/my", authenticate, authorizeRoles("admin"), getMyDonations);

/**
 * @swagger
 * /donations/all:
 *   get:
 *     summary: Get all donations
 *     description: Requires super admin.
 *     tags: [Donations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All donations fetched successfully
 */
router.get("/all", authenticate, authorizeSuperAdmin, getAllDonations);

/**
 * @swagger
 * /donations/{id}:
 *   patch:
 *     summary: Update donation
 *     description: Requires admin role. Updating sends donation back for super admin approval.
 *     tags: [Donations]
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
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Donation updated successfully
 *       404:
 *         description: Donation not found
 */
router.patch(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  uploadDonationImage.single("image"),
  validate(donationIdParamsSchema, "params"),
  validate(updateDonationSchema),
  updateDonation
);

/**
 * @swagger
 * /donations/{id}:
 *   delete:
 *     summary: Delete donation
 *     description: Requires admin role.
 *     tags: [Donations]
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
 *         description: Donation deleted successfully
 *       404:
 *         description: Donation not found
 */
router.delete(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  validate(donationIdParamsSchema, "params"),
  deleteDonation
);

/**
 * @swagger
 * /donations/review/{id}:
 *   put:
 *     summary: Review donation
 *     description: Requires super admin. Set status to APPROVED or REJECTED.
 *     tags: [Donations]
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
 *         description: Donation reviewed successfully
 *       404:
 *         description: Donation not found
 */
router.put(
  "/review/:id",
  authenticate,
  authorizeSuperAdmin,
  validate(donationIdParamsSchema, "params"),
  validate(reviewDonationSchema),
  reviewDonation
);

module.exports = router;
