const express = require("express");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require("../controllers/userNotificationController");
const {
  listUserNotificationsQuerySchema,
  userNotificationIdParamsSchema,
} = require("../validations/userNotificationValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: User Notifications
 *   description: Mobile user notification inbox (push history)
 */

/**
 * @swagger
 * /user/notifications:
 *   get:
 *     summary: List notifications for the logged-in user
 *     description: |
 *       Returns the user's notification inbox: admin broadcasts and order milestones.
 *       Order `type` values include `ORDER_PLACED`, `ORDER_SHIPPED`, `ORDER_DELIVERED`,
 *       plus `ORDER_CANCELLED`, `ORDER_FULFILLED`, `ORDER_REFUND_PROCESSED`, etc.
 *       Each item includes id, title, body, `type`, `data`, read flag, and sentAt.
 *     tags: [User Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *       - in: query
 *         name: unreadOnly
 *         schema: { type: boolean, default: false }
 *     responses:
 *       200:
 *         description: Inbox list
 */
router.get(
  "/",
  authenticate,
  validate(listUserNotificationsQuerySchema, "query"),
  listMyNotifications
);

/**
 * @swagger
 * /user/notifications/read-all:
 *   post:
 *     summary: Mark all notifications as read
 *     tags: [User Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.post("/read-all", authenticate, markAllNotificationsRead);

/**
 * @swagger
 * /user/notifications/{id}/read:
 *   post:
 *     summary: Mark one notification as read
 *     tags: [User Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: UserNotification inbox row id (not broadcast id)
 */
router.post(
  "/:id/read",
  authenticate,
  validate(userNotificationIdParamsSchema, "params"),
  markNotificationRead
);

module.exports = router;
