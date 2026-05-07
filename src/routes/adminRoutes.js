const express = require("express");
const authenticate = require("../middleware/authenticate");
const adminMiddleware = require("../middleware/adminMiddleware");
const superAdminMiddleware = require("../middleware/superAdminMiddleware");
const validate = require("../middleware/validate");
const {
  getAdminUsers,
  getRegularUsers,
  removeAdmin,
  deleteUser,
  restoreUser,
  getAdminDashboard,
} = require("../controllers/adminController");
const {
  removeAdminParamsSchema,
  adminUsersQuerySchema,
  deleteUserParamsSchema,
  restoreUserParamsSchema,
} = require("../validations/adminValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin operations. Note - normal users CAN NOT be promoted to admin via API. Use POST /superadmin/admins to create dedicated admins.
 */

/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: List admin (or superadmin) users (paginated)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Email substring search
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, superadmin]
 *           default: admin
 *       - in: query
 *         name: includeDeleted
 *         schema: { type: boolean, default: false }
 *     responses:
 *       200: { description: Admin users fetched }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 */
router.get(
  "/users",
  authenticate,
  adminMiddleware,
  validate(adminUsersQuerySchema, "query"),
  getAdminUsers
);

/**
 * @swagger
 * /admin/regular-users:
 *   get:
 *     summary: List regular users (paginated)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: includeDeleted
 *         schema: { type: boolean, default: false }
 *     responses:
 *       200: { description: Regular users fetched }
 */
router.get(
  "/regular-users",
  authenticate,
  adminMiddleware,
  validate(adminUsersQuerySchema, "query"),
  getRegularUsers
);

/**
 * @swagger
 * /admin/remove-admin/{id}:
 *   patch:
 *     summary: Remove admin role from a user
 *     description: Super admin only. Cannot demote a superadmin. Sets role=user, canLoginAdminPanel=false.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Admin role removed }
 *       400: { description: Cannot demote superadmin }
 *       403: { description: Forbidden }
 *       404: { description: User not found }
 */
router.patch(
  "/remove-admin/:id",
  authenticate,
  superAdminMiddleware,
  validate(removeAdminParamsSchema, "params"),
  removeAdmin
);

/**
 * @swagger
 * /admin/delete-user/{id}:
 *   delete:
 *     summary: Soft-delete a user
 *     description: Super admin only. Cannot delete admin or superadmin accounts. Sets isDeleted=true, clears fcmTokens.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: User soft-deleted }
 *       400: { description: Cannot delete admin/super-admin }
 *       404: { description: User not found }
 */
router.delete(
  "/delete-user/:id",
  authenticate,
  superAdminMiddleware,
  validate(deleteUserParamsSchema, "params"),
  deleteUser
);

/**
 * @swagger
 * /admin/restore-user/{id}:
 *   patch:
 *     summary: Restore a soft-deleted user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: User restored }
 *       404: { description: User not found }
 */
router.patch(
  "/restore-user/:id",
  authenticate,
  superAdminMiddleware,
  validate(restoreUserParamsSchema, "params"),
  restoreUser
);

/**
 * @swagger
 * /admin/dashboard:
 *   get:
 *     summary: Admin dashboard metrics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Admin dashboard fetched }
 */
router.get("/dashboard", authenticate, adminMiddleware, getAdminDashboard);

module.exports = router;
