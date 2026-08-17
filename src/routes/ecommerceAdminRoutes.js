const express = require("express");
const authenticate = require("../middleware/authenticate");
const adminMiddleware = require("../middleware/adminMiddleware");
const validate = require("../middleware/validate");
const {
  getEcommerceSettings,
  updateEcommerceSettings,
} = require("../controllers/ecommerceSettingsController");
const {
  updateEcommerceSettingsSchema,
} = require("../validations/ecommerceSettingsValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Ecommerce
 *   description: Store ecommerce settings (VAT)
 */

router.use(authenticate, adminMiddleware);

/**
 * @swagger
 * /admin/ecommerce/settings:
 *   get:
 *     summary: Get ecommerce VAT settings
 *     tags: [Ecommerce]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings fetched
 *   put:
 *     summary: Update ecommerce VAT settings
 *     tags: [Ecommerce]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings updated
 */
router.get("/settings", getEcommerceSettings);
router.put(
  "/settings",
  validate(updateEcommerceSettingsSchema),
  updateEcommerceSettings
);

module.exports = router;
