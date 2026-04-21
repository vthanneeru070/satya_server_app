const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const validate = require("../middleware/validate");
const {
  createDailySloka,
  getDailySloka,
} = require("../controllers/dailySlokaController");
const {
  createDailySlokaSchema,
  dailySlokaQuerySchema,
} = require("../validations/dailySlokaValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Daily Sloka
 *   description: Daily sloka management APIs
 */

/**
 * @swagger
 * /daily-slokas:
 *   post:
 *     summary: Create or update daily sloka
 *     description: Requires admin or super admin. Saves one sloka per date.
 *     tags: [Daily Sloka]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sloka, date]
 *             properties:
 *               sloka:
 *                 type: string
 *               date:
 *                 type: string
 *                 example: 20-04-2026
 *     responses:
 *       201:
 *         description: Daily sloka saved successfully
 */
router.post("/", authenticate, authorizeRoles("admin"), validate(createDailySlokaSchema), createDailySloka);

/**
 * @swagger
 * /daily-slokas:
 *   get:
 *     summary: Get daily sloka by date
 *     description: All authenticated users can view sloka for a specific date. If date is omitted, today's sloka is returned.
 *     tags: [Daily Sloka]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           example: 20-04-2026
 *         required: false
 *     responses:
 *       200:
 *         description: Daily sloka fetched successfully
 */
router.get("/", authenticate, validate(dailySlokaQuerySchema, "query"), getDailySloka);

module.exports = router;
