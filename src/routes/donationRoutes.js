const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const authorizeSuperAdmin = require("../middleware/authorizeSuperAdmin");
const validate = require("../middleware/validate");
const upload = require("../middleware/upload");
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
  initiateDonation,
  listMyDonationContributions,
  adminListDonationContributions,
} = require("../controllers/donationPaymentController");
const {
  createDonationSchema,
  updateDonationSchema,
  reviewDonationSchema,
  donationIdParamsSchema,
  allDonationsQuerySchema,
} = require("../validations/donationValidation");
const {
  initiateDonationSchema,
  listContributionsQuerySchema,
} = require("../validations/donationPaymentValidation");

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
 *         description: Approved donations fetched successfully
 */
router.get("/", authenticate, validate(allDonationsQuerySchema, "query"), getVisibleDonations);

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
  upload.single("image"),
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
 *         description: My donations fetched successfully
 */
router.get(
  "/my",
  authenticate,
  authorizeRoles("admin"),
  validate(allDonationsQuerySchema, "query"),
  getMyDonations
);

/**
 * @swagger
 * /donations/all:
 *   get:
 *     summary: Get all donations
 *     description: Requires super admin.
 *     tags: [Donations]
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
 *         description: All donations fetched successfully
 */
router.get(
  "/all",
  authenticate,
  authorizeRoles("admin"),
  validate(allDonationsQuerySchema, "query"),
  getAllDonations
);

/**
 * @swagger
 * /donations/contributions/my:
 *   get:
 *     summary: List my donation contributions
 *     description: Authenticated user. Returns Paystack-tracked donations made by the current user.
 *     tags: [Donations]
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
 *         name: paymentStatus
 *         schema:
 *           type: string
 *           enum: [PENDING, PAID, FAILED, REFUNDED]
 *       - in: query
 *         name: donation
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: My donation contributions fetched
 */
router.get(
  "/contributions/my",
  authenticate,
  validate(listContributionsQuerySchema, "query"),
  listMyDonationContributions
);

/**
 * @swagger
 * /donations/contributions/all:
 *   get:
 *     summary: List all donation contributions
 *     description: Requires super admin. Returns Paystack-tracked donations across all users.
 *     tags: [Donations]
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
 *         name: paymentStatus
 *         schema:
 *           type: string
 *           enum: [PENDING, PAID, FAILED, REFUNDED]
 *       - in: query
 *         name: donation
 *         schema:
 *           type: string
 *       - in: query
 *         name: user
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Donation contributions fetched
 */
router.get(
  "/contributions/all",
  authenticate,
  authorizeSuperAdmin,
  validate(listContributionsQuerySchema, "query"),
  adminListDonationContributions
);

/**
 * @swagger
 * /donations/{id}/donate:
 *   post:
 *     summary: Start a Paystack donation
 *     description: |
 *       Initializes a Paystack transaction for a donation and returns an
 *       authorization_url for the client to open. If `callbackUrl` is omitted,
 *       the server falls back to `PAYSTACK_CALLBACK_URL`. The resolved
 *       `callbackUrl` is echoed in the response so the WebView knows which
 *       redirect host to intercept. Settlement only happens after server-side
 *       verify.
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
 *             required: [amount]
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 10
 *                 example: 100
 *               currency:
 *                 type: string
 *                 default: ZAR
 *               note:
 *                 type: string
 *                 maxLength: 280
 *               callbackUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       201:
 *         description: Donation initialized; client should open authorization_url
 *       404:
 *         description: Donation not found
 */
router.post(
  "/:id/donate",
  authenticate,
  validate(donationIdParamsSchema, "params"),
  validate(initiateDonationSchema),
  initiateDonation
);

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
  upload.single("image"),
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
