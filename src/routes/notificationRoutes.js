const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const validate = require("../middleware/validate");
const {
  sendNotification,
  listNotifications,
  getNotificationById,
  cancelNotification,
} = require("../controllers/notificationController");
const {
  sendNotificationSchema,
  listNotificationsQuerySchema,
  notificationIdParamsSchema,
} = require("../validations/notificationValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Admin-side broadcast push notifications
 */

/**
 * @swagger
 * /notifications/send:
 *   post:
 *     summary: Send (or schedule) a broadcast push notification
 *     description: |
 *       Admin / Superadmin only. Sends an FCM push to a target audience.
 *       Provide `scheduledAt` (ISO date in the future) to schedule; omit it to
 *       send immediately. Returns the persisted Notification record. Aggregate
 *       delivery counts are written back after dispatch completes.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, body]
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 120
 *                 example: Festival reminder
 *               body:
 *                 type: string
 *                 maxLength: 1000
 *                 example: Ganesh Chaturthi pooja begins at 6 AM tomorrow.
 *               audience:
 *                 type: string
 *                 enum: [ALL, USERS, ADMINS, SUPERADMIN, USER_IDS]
 *                 default: ALL
 *               userIds:
 *                 type: array
 *                 items: { type: string }
 *                 description: Required when audience is USER_IDS
 *               data:
 *                 type: object
 *                 description: Extra key/value pairs sent in FCM data payload (all values coerced to strings).
 *               imageUrl:
 *                 type: string
 *                 format: uri
 *               scheduledAt:
 *                 type: string
 *                 format: date-time
 *                 description: Optional ISO timestamp in the future. If omitted, the notification is sent immediately.
 *     responses:
 *       201:
 *         description: Notification queued or scheduled
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin role required
 */
router.post(
  "/send",
  authenticate,
  authorizeRoles("admin"),
  validate(sendNotificationSchema),
  sendNotification
);

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: List broadcast notifications (history)
 *     description: Admin / Superadmin only. Supports filtering by status and audience.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, SCHEDULED, SENDING, SENT, FAILED, CANCELLED]
 *       - in: query
 *         name: audience
 *         schema:
 *           type: string
 *           enum: [ALL, USERS, ADMINS, SUPERADMIN, USER_IDS]
 *     responses:
 *       200:
 *         description: Notifications fetched
 */
router.get(
  "/",
  authenticate,
  authorizeRoles("admin"),
  validate(listNotificationsQuerySchema, "query"),
  listNotifications
);

/**
 * @swagger
 * /notifications/{id}:
 *   get:
 *     summary: Get a single broadcast notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Notification fetched
 *       404:
 *         description: Not found
 */
router.get(
  "/:id",
  authenticate,
  authorizeRoles("admin"),
  validate(notificationIdParamsSchema, "params"),
  getNotificationById
);

/**
 * @swagger
 * /notifications/{id}/cancel:
 *   post:
 *     summary: Cancel a scheduled notification (before send)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Notification cancelled
 *       404:
 *         description: Not found or no longer cancellable
 */
router.post(
  "/:id/cancel",
  authenticate,
  authorizeRoles("admin"),
  validate(notificationIdParamsSchema, "params"),
  cancelNotification
);

module.exports = router;
