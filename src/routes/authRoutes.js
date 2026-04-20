const express = require("express");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const {
  login,
  adminLogin,
  refreshAccessToken,
  logout,
  getProfile,
} = require("../controllers/authController");
const { refreshTokenSchema, logoutSchema } = require("../validations/authValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication APIs
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: User login (Firebase)
 *     description: Logs in any valid Firebase-authenticated user. If user does not exist in MongoDB, backend creates user with default role `user`.
 *     tags: [Auth]
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *           example: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IkZJUkVCQVNFX0lEX1RPS0VOIiwi...
 *         description: Firebase ID token from client auth provider (phone/google/apple), prefixed with Bearer.
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Missing or invalid token format
 *       401:
 *         description: Firebase token verification failed
 */
router.post("/login", login);

/**
 * @swagger
 * /auth/admin/login:
 *   post:
 *     summary: Admin login (Firebase)
 *     description: Logs in only users that already have `admin` role in MongoDB. Firebase is used only for identity verification.
 *     tags: [Auth]
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *           example: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IkZJUkVCQVNFX0lEX1RPS0VOIiwi...
 *         description: Firebase ID token prefixed with Bearer.
 *     responses:
 *       200:
 *         description: Admin login successful
 *       401:
 *         description: Firebase token verification failed
 *       403:
 *         description: Admin access denied
 *       404:
 *         description: Admin user not found
 */
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
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Access token refreshed
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post("/refresh", validate(refreshTokenSchema), refreshAccessToken);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout user
 *     description: Invalidates a stored refresh token.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
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
 *       401:
 *         description: Unauthorized
 */
router.get("/profile", authenticate, getProfile);

module.exports = router;
