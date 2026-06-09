const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const { recordAppOpen, getStreak } = require("../controllers/userStreakController");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: User Streak
 *   description: Daily app-open streak for mobile users
 */

/**
 * @swagger
 * /user/streak:
 *   post:
 *     summary: Record app open for today (maintains daily streak)
 *     description: |
 *       Idempotent per calendar day in the user's timezone (`X-Timezone` header or profile timezone).
 *       Consecutive days increment `streakCount`; missing a day resets to 1.
 *     tags: [User Streak]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Timezone
 *         schema: { type: string, example: Asia/Kolkata }
 *     responses:
 *       200: { description: Streak updated or already recorded today }
 */
router.post(
  "/",
  authenticate,
  authorizeRoles("user"),
  recordAppOpen
);

/**
 * @swagger
 * /user/streak:
 *   get:
 *     summary: Get current streak status
 *     tags: [User Streak]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Timezone
 *         schema: { type: string, example: Asia/Kolkata }
 *     responses:
 *       200: { description: Streak status }
 */
router.get(
  "/",
  authenticate,
  authorizeRoles("user"),
  getStreak
);

module.exports = router;
