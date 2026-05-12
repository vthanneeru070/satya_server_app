const express = require("express");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const {
  registerToken,
  unregisterToken,
  getMyTokenStatus,
} = require("../controllers/fcmController");
const {
  registerFcmTokenSchema,
  unregisterFcmTokenSchema,
} = require("../validations/fcmValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: FCM
 *   description: Firebase Cloud Messaging device token management
 */

/**
 * @swagger
 * /fcm/register:
 *   post:
 *     summary: Register an FCM device token for the authenticated user
 *     description: |
 *       Adds the device's FCM token to the authenticated user's `fcmTokens` set
 *       (idempotent — duplicates are deduped server-side). Call this after the
 *       Flutter app obtains a token via `FirebaseMessaging.getToken()` and on
 *       every `onTokenRefresh` event.
 *     tags: [FCM]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *                 description: FCM registration token from the device
 *               deviceId:
 *                 type: string
 *               platform:
 *                 type: string
 *                 enum: [android, ios, web]
 *     responses:
 *       200:
 *         description: FCM token registered
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/register",
  authenticate,
  validate(registerFcmTokenSchema),
  registerToken
);

/**
 * @swagger
 * /fcm/unregister:
 *   delete:
 *     summary: Unregister an FCM device token
 *     description: |
 *       Removes a single FCM token from the authenticated user. Call this on
 *       logout or when Firebase rotates the device token.
 *     tags: [FCM]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: FCM token removed
 *       401:
 *         description: Unauthorized
 */
router.delete(
  "/unregister",
  authenticate,
  validate(unregisterFcmTokenSchema),
  unregisterToken
);

/**
 * @swagger
 * /fcm/me:
 *   get:
 *     summary: Get the count of FCM tokens registered for the authenticated user
 *     description: Useful sanity check from the client after registering.
 *     tags: [FCM]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token status
 */
router.get("/me", authenticate, getMyTokenStatus);

module.exports = router;
