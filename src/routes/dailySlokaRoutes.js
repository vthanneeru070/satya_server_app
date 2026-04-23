const express = require("express");
const authenticate = require("../middleware/authenticate");
const authorizeRoles = require("../middleware/authorizeRoles");
const authorizeSuperAdmin = require("../middleware/authorizeSuperAdmin");
const validate = require("../middleware/validate");
const uploadSlokaImport = require("../middleware/uploadSlokaImport");
const {
  createDailySloka,
  getDailySloka,
  bulkImportDailySlokas,
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
 * /daily-slokas/create-sloka:
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
 *               author:
 *                 type: string
 *               date:
 *                 type: string
 *                 example: 20-04-2026
 *     responses:
 *       201:
 *         description: Daily sloka saved successfully
 */
router.post("/create-sloka", authenticate, authorizeRoles("admin"), validate(createDailySlokaSchema), createDailySloka);

/**
 * @swagger
 * /daily-slokas/import:
 *   post:
 *     summary: Bulk import daily slokas from xlsx or docx table
 *     description: |
 *       Requires super admin role.
 *       Accepts .xlsx or .docx file with columns date, sloka, and optional author.
 *       Date format must be dd-mm-yyyy.
 *       Existing sloka with same date is updated.
 *     tags: [Daily Sloka]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Daily slokas imported successfully
 *       400:
 *         description: Invalid file or invalid rows
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (super admin required)
 */
router.post(
  "/import",
  authenticate,
  authorizeSuperAdmin,
  uploadSlokaImport.single("file"),
  bulkImportDailySlokas
);

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
