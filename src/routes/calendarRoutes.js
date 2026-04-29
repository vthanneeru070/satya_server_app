const express = require("express");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const { getCalendarItems } = require("../controllers/calendarController");
const { calendarQuerySchema } = require("../validations/calendarValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Calendar
 *   description: Month-wise calendar APIs for festivals and poojas
 */

/**
 * @swagger
 * /calendar:
 *   get:
 *     summary: Get festivals, poojas and moon phases by month and year
 *     description: |
 *       Returns all festivals, poojas and moon phases for the given month/year.
 *       Users get approved items only, while admins get all statuses.
 *     tags: [Calendar]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         example: 4
 *       - in: query
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *         example: 2026
 *       - in: query
 *         name: timezone
 *         required: false
 *         schema:
 *           type: string
 *         example: Asia/Kolkata
 *         description: IANA timezone. Can also be passed via x-timezone header.
 *     responses:
 *       200:
 *         description: Calendar data fetched successfully
 *       400:
 *         description: Invalid query
 *       401:
 *         description: Unauthorized
 */
router.get("/", authenticate, validate(calendarQuerySchema, "query"), getCalendarItems);

module.exports = router;
