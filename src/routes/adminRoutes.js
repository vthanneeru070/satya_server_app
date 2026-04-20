const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const authorizeSuperAdmin = require("../middleware/authorizeSuperAdmin");
const validate = require("../middleware/validate");
const {
  createAdmin,
  getAdminUsers,
  getRegularUsers,
  removeAdmin,
  deleteUser,
} = require("../controllers/adminController");
const {
  createAdminSchema,
  removeAdminParamsSchema,
  adminUsersQuerySchema,
  deleteUserParamsSchema,
} = require("../validations/adminValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin APIs with role-based access control
 */

/**
 * @swagger
 * /admin/create-admin:
 *   post:
 *     summary: Promote a user to admin
 *     description: Requires admin role. Finds a user by email and updates role to admin.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: User promoted to admin
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (role not allowed)
 *       404:
 *         description: User not found
 */
router.post(
  "/create-admin",
  authenticate,
  authorizeRoles("admin"),
  validate(createAdminSchema),
  createAdmin
);

/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: Get all admin users
 *     description: Requires admin role. Returns paginated list of users with role admin including createdBy.
 *     tags: [Admin]
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Optional email search
 *     responses:
 *       200:
 *         description: Admin users fetched
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (role not allowed)
 */
router.get(
  "/users",
  authenticate,
  authorizeRoles("admin"),
  validate(adminUsersQuerySchema, "query"),
  getAdminUsers
);

/**
 * @swagger
 * /admin/regular-users:
 *   get:
 *     summary: Get all users with role user
 *     description: Requires admin role. Returns paginated list of users with role user.
 *     tags: [Admin]
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Optional email search
 *     responses:
 *       200:
 *         description: Regular users fetched
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (role not allowed)
 */
router.get(
  "/regular-users",
  authenticate,
  authorizeRoles("admin"),
  validate(adminUsersQuerySchema, "query"),
  getRegularUsers
);

/**
 * @swagger
 * /admin/remove-admin/{id}:
 *   patch:
 *     summary: Remove admin role
 *     description: Requires super admin. Demotes admin back to user and blocks super admin demotion.
 *     tags: [Admin]
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
 *         description: Admin role removed
 *       400:
 *         description: Invalid operation
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (super admin required)
 */
router.patch(
  "/remove-admin/:id",
  authenticate,
  authorizeSuperAdmin,
  validate(removeAdminParamsSchema, "params"),
  removeAdmin
);

router.delete("/delete-user/:id", authenticate, authorizeSuperAdmin, validate(deleteUserParamsSchema, "params"), deleteUser);
module.exports = router;
