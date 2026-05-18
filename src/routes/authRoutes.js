const express = require("express");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const upload = require("../middleware/upload");
const {
  login,
  adminLogin,
  refreshAccessToken,
  logout,
  getProfile,
  createProfile,
  editProfile,
  deleteAccount,
} = require("../controllers/authController");
const {
  refreshTokenSchema,
  logoutSchema,
  createProfileSchema,
  updateProfileSchema,
  deleteAccountSchema,
} = require("../validations/authValidation");

const router = express.Router();

const profileUpload = upload.fields([{ name: "image", maxCount: 1 }]);

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Firebase authentication, JWT tokens, and mobile user profile (registration)
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: User login (Firebase)
 *     description: |
 *       Verify Firebase ID token (Google, Apple, or password). Creates user on first sign-in.
 *       Response includes **`isRegistered`**: `true` → navigate to home; `false` → basic-details / registration screen.
 *     tags: [Auth]
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *           example: Bearer eyJhbGciOiJSUzI1NiIs...
 *         description: Firebase ID token prefixed with Bearer.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user:
 *                 type: object
 *                 description: Optional profile hints from the client
 *                 properties:
 *                   email: { type: string }
 *                   fullName: { type: string }
 *                   photoUrl: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Login successful }
 *                 data: { $ref: "#/components/schemas/LoginResponse" }
 *       401:
 *         description: Invalid Firebase token
 *         content:
 *           application/json:
 *             schema: { $ref: "#/components/schemas/ErrorResponse" }
 *       403:
 *         description: Admin account must use admin-login; or account deleted
 */
router.post("/login", login);

/**
 * @swagger
 * /auth/admin-login:
 *   post:
 *     summary: Admin panel login (Firebase password only)
 *     tags: [Auth]
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Admin login successful
 *       403:
 *         description: Wrong provider, role, or panel access
 *       404:
 *         description: Admin account not found
 */
router.post("/admin-login", adminLogin);
router.post("/admin/login", adminLogin);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: New access token issued
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post("/refresh", validate(refreshTokenSchema), refreshAccessToken);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout (revoke refresh token)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post("/logout", validate(logoutSchema), logout);

/**
 * @swagger
 * /auth/profile:
 *   get:
 *     summary: Get logged-in user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 data: { $ref: "#/components/schemas/UserProfilePayload" }
 *       401:
 *         description: Unauthorized
 */
router.get("/profile", authenticate, getProfile);

/**
 * @swagger
 * /auth/profile:
 *   post:
 *     summary: Create profile (first-time registration)
 *     description: |
 *       Multipart form after Firebase login when `isRegistered` is false.
 *       Required fields + profile `image` (unless OAuth `photoUrl` already set).
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: "#/components/schemas/ProfileCreateMultipart"
 *     responses:
 *       201:
 *         description: Profile created; isRegistered true when complete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: "#/components/schemas/UserProfilePayload" }
 *       409:
 *         description: Profile already registered (use PATCH to edit)
 */
router.post(
  "/profile",
  authenticate,
  profileUpload,
  validate(createProfileSchema),
  createProfile
);

/**
 * @swagger
 * /auth/profile:
 *   patch:
 *     summary: Edit profile (partial update)
 *     description: Send only fields to change. Optional new `image` file replaces S3 profile photo.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: "#/components/schemas/ProfileUpdateMultipart"
 *     responses:
 *       200:
 *         description: Profile updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: "#/components/schemas/UserProfilePayload" }
 */
router.patch(
  "/profile",
  authenticate,
  profileUpload,
  validate(updateProfileSchema),
  editProfile
);

/**
 * @swagger
 * /auth/account:
 *   delete:
 *     summary: Delete account (soft delete)
 *     description: |
 *       Sets `isDeleted`, clears FCM tokens, removes profile image from S3, revokes refresh tokens.
 *       Deleted users cannot log in again.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/DeleteAccountBody"
 *     responses:
 *       200:
 *         description: Account deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     deleted: { type: boolean, example: true }
 */
router.delete(
  "/account",
  authenticate,
  validate(deleteAccountSchema),
  deleteAccount
);

module.exports = router;
