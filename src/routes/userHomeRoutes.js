const express = require("express");
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
 *     description: |
 *       Returns today's date & tithi, daily sloka, latest 5 poojas,
 *       upcoming 5 approved festivals, and 5 approved donations.
 *       Optional `x-timezone` header or `timezone` query (IANA) for date/tithi
 *       and daily sloka lookup. Defaults to `Asia/Kolkata`.
 *     tags: [User Home]
 *     parameters:
 *       - in: header
 *         name: x-timezone
 *         required: false
 *         schema:
 *           type: string
 *           example: Asia/Kolkata
 *     responses:
 *       200:
 *         description: User home data fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     todayDate:
 *                       type: string
 *                       example: "31st May, 2026"
 *                     todayTithi:
 *                       type: string
 *                       example: Ekadashi
 *                     todayDateAndTithi:
 *                       type: string
 *                       example: "31st May, 2026 | Ekadashi"
 *                     timezone: { type: string, example: Asia/Kolkata }
 *                     dailySloka: { type: object, nullable: true }
 *                     poojas: { type: array, items: { type: object } }
 *                     festivals: { type: array, items: { type: object } }
 *                     donations: { type: array, items: { type: object } }
 */
router.get("/", getUserHome);

module.exports = router;
