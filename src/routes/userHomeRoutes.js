const express = require("express");
const authenticate = require("../middleware/authenticate");
const { getUserHome } = require("../controllers/userHomeController");

const router = express.Router();

const optionalAuthenticate = (req, res, next) => {
  if (!req.headers.authorization) return next();
  return authenticate(req, res, (err) => {
    if (err) return next();
    return next();
  });
};

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
 *
 *       When a valid Bearer token is supplied, the response also includes
 *       `completedPujasCount`, `completedRitualsCount`, and `streak` for that user.
 *       Without auth, counts are `0` and `streak` is `null`.
 *     tags: [User Home]
 *     security:
 *       - bearerAuth: []
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
 *                     completedPujasCount:
 *                       type: integer
 *                       example: 3
 *                       description: Distinct completed poojas for the authenticated user
 *                     completedRitualsCount:
 *                       type: integer
 *                       example: 1
 *                       description: Distinct completed rituals for the authenticated user
 *                     streak:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         streakCount: { type: integer, example: 5 }
 *                         streakLastDateKey: { type: string, example: "2026-09-02" }
 *                         todayDateKey: { type: string, example: "2026-09-02" }
 *                         activeToday: { type: boolean, example: true }
 *                         timezone: { type: string, example: Asia/Kolkata }
 *                     dailySloka: { type: object, nullable: true }
 *                     dailyPoojas: { type: array, items: { type: object } }
 *                     poojas: { type: array, items: { type: object } }
 *                     festivals: { type: array, items: { type: object } }
 *                     donations: { type: array, items: { type: object } }
 */
router.get("/", optionalAuthenticate, getUserHome);

module.exports = router;
