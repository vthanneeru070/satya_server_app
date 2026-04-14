const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const validate = require("../middleware/validate");
const { getUsers } = require("../controllers/adminController");
const { paginationQuerySchema } = require("../validations/commonValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin APIs (requires admin role)
 */

/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: Get all users
 *     description: Requires `admin` role. Returns paginated user list.
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
 *     responses:
 *       200:
 *         description: Users fetched
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (role not allowed)
 */
router.get(
  "/users",
  authenticate,
  authorizeRoles("admin"),
  validate(paginationQuerySchema, "query"),
  getUsers
);

module.exports = router;
