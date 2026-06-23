const express = require("express");
const authenticate = require("../middleware/authenticate");
const superAdminMiddleware = require("../middleware/superAdminMiddleware");
const validate = require("../middleware/validate");
const {
  createDedicatedAdmin,
  deleteDedicatedAdmin,
  resendPasswordResetLink,
  setAdminPanelAccess,
  listAdmins,
} = require("../controllers/superAdminController");
const {
  createDedicatedAdminSchema,
  adminIdParamsSchema,
  listAdminsQuerySchema,
} = require("../validations/superAdminValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: SuperAdmin
 *   description: Super-admin only operations. Creates dedicated admin accounts that bypass the user app entirely.
 */

/**
 * @swagger
 * /superadmin/admins:
 *   post:
 *     summary: Create a dedicated admin account (Firebase + Mongo)
 *     description: |
 *       Creates a Firebase Auth user (provider=password), persists a Mongo user with
 *       role=admin and canLoginAdminPanel=true, and returns a password reset link the
 *       admin uses to set their initial password. Normal users are NEVER promoted via
 *       this endpoint — the admin is a brand-new dedicated account.
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, email]
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: "Temple Admin"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "admin@example.com"
 *               phone:
 *                 type: string
 *                 example: "+919999999999"
 *     responses:
 *       201:
 *         description: Dedicated admin created
 *       400:
 *         description: Validation error
 *       403:
 *         description: Forbidden (super admin required)
 *       409:
 *         description: Duplicate email
 *       500:
 *         description: Firebase or DB failure
 */
router.post(
  "/admins",
  authenticate,
  superAdminMiddleware,
  validate(createDedicatedAdminSchema),
  createDedicatedAdmin
);

/**
 * @swagger
 * /superadmin/admins:
 *   get:
 *     summary: List all admin/superadmin accounts (paginated)
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Matches admin fullName, email, or phone (partial, case-insensitive)
 *       - in: query
 *         name: includeDeleted
 *         schema: { type: boolean, default: false }
 *     responses:
 *       200: { description: Admins fetched }
 */
router.get(
  "/admins",
  authenticate,
  superAdminMiddleware,
  validate(listAdminsQuerySchema, "query"),
  listAdmins
);

/**
 * @swagger
 * /superadmin/admins/{id}/password-reset-link:
 *   post:
 *     summary: Generate a fresh password reset link for an admin
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Password reset link generated }
 *       404: { description: Admin not found }
 */
/**
 * @swagger
 * /superadmin/admins/{id}:
 *   delete:
 *     summary: Permanently delete a dedicated admin (Firebase + MongoDB)
 *     description: |
 *       Superadmin only. Hard-deletes a user with `role=admin` from MongoDB and
 *       removes their Firebase Auth account. Cannot delete superadmins or yourself.
 *       Revokes all refresh tokens for that admin.
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Admin deleted }
 *       400: { description: Cannot delete superadmin or self }
 *       403: { description: Superadmin required }
 *       404: { description: Admin not found }
 *       502: { description: Firebase deletion failed }
 */
router.delete(
  "/admins/:id",
  authenticate,
  superAdminMiddleware,
  validate(adminIdParamsSchema, "params"),
  deleteDedicatedAdmin
);

router.post(
  "/admins/:id/password-reset-link",
  authenticate,
  superAdminMiddleware,
  validate(adminIdParamsSchema, "params"),
  resendPasswordResetLink
);

/**
 * @swagger
 * /superadmin/admins/{id}/panel-access:
 *   patch:
 *     summary: Toggle canLoginAdminPanel for an admin (suspend/restore)
 *     tags: [SuperAdmin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [canLoginAdminPanel]
 *             properties:
 *               canLoginAdminPanel: { type: boolean }
 *     responses:
 *       200: { description: Admin panel access updated }
 *       400: { description: Cannot revoke from superadmin }
 *       404: { description: Admin not found }
 */
router.patch(
  "/admins/:id/panel-access",
  authenticate,
  superAdminMiddleware,
  validate(adminIdParamsSchema, "params"),
  setAdminPanelAccess
);

module.exports = router;
