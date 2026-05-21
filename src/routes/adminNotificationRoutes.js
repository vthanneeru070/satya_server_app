const express = require("express");
const authenticate = require("../middleware/authenticate");
const adminMiddleware = require("../middleware/adminMiddleware");
const validate = require("../middleware/validate");
const {
  listNotifications,
  getUnreadCount,
  getNotificationById,
  markRead,
  markAllRead,
} = require("../controllers/adminNotificationController");
const {
  listAdminNotificationsQuerySchema,
  adminNotificationIdParamsSchema,
} = require("../validations/adminNotificationValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Admin Notifications
 *   description: Real-time admin inbox (orders, donations, refund requests) + FCM history
 */

/**
 * @swagger
 * /admin/notifications:
 *   get:
 *     summary: List admin notifications (paginated inbox)
 *     tags: [Admin Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/",
  authenticate,
  adminMiddleware,
  validate(listAdminNotificationsQuerySchema, "query"),
  listNotifications
);

/**
 * @swagger
 * /admin/notifications/unread-count:
 *   get:
 *     summary: Unread notification count for badge
 *     tags: [Admin Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.get("/unread-count", authenticate, adminMiddleware, getUnreadCount);

router.post("/read-all", authenticate, adminMiddleware, markAllRead);

router.get(
  "/:id",
  authenticate,
  adminMiddleware,
  validate(adminNotificationIdParamsSchema, "params"),
  getNotificationById
);

router.post(
  "/:id/read",
  authenticate,
  adminMiddleware,
  validate(adminNotificationIdParamsSchema, "params"),
  markRead
);

module.exports = router;
