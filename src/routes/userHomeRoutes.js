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
 *       Returns today's date & tithi, daily sloka, poojas, festivals, and donations
 *       for the request timezone (`x-timezone` header or `timezone` query; IANA).
 *       Defaults to `Africa/Johannesburg`. Daily sloka matches the local calendar day.
 *       Poojas are daily or scheduled from local today onward. Festivals are
 *       upcoming or still ongoing as of local today. Donations are approved and
 *       visible.
 *     tags: [User Home]
 *     parameters:
 *       - in: header
 *         name: x-timezone
 *         required: false
 *         schema:
 *           type: string
 *           example: Africa/Johannesburg
 *       - in: query
 *         name: timezone
 *         required: false
 *         schema:
 *           type: string
 *           example: Africa/Johannesburg
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
 *                     timezone: { type: string, example: Africa/Johannesburg }
                     todayDateKey: { type: string, example: "18-08-2026" }
 *                     dailySloka: { type: object, nullable: true }
 *                     dailyPoojas: { type: array, items: { type: object } }
 *                     poojas: { type: array, items: { type: object } }
 *                     festivals: { type: array, items: { type: object } }
 *                     donations: { type: array, items: { type: object } }
 */
router.get("/", getUserHome);

module.exports = router;
