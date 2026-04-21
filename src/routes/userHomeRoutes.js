const express = require("express");
const authenticate = require("../middleware/authenticate");
const { getUserHome } = require("../controllers/userHomeController");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: User Home
 *   description: Aggregated user home APIs
 */

/**
 * @swagger
 * /user-home:
 *   get:
 *     summary: Get user home data
 *     description: Returns today's daily sloka, latest 5 poojas, upcoming 5 approved festivals, and 10 approved donations.
 *     tags: [User Home]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User home data fetched successfully
 */
router.get("/", authenticate, getUserHome);

module.exports = router;
