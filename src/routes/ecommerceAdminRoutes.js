const express = require("express");
const authenticate = require("../middleware/authenticate");
const adminMiddleware = require("../middleware/adminMiddleware");
const validate = require("../middleware/validate");
const {
  getEcommerceSettings,
  updateEcommerceSettings,
} = require("../controllers/ecommerceSettingsController");
const { updateEcommerceSettingsSchema } = require("../validations/ecommerceSettingsValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Ecommerce
 *   description: E-commerce store settings (admin)
 */

router.use(authenticate, adminMiddleware);

/**
 * @swagger
 * /admin/ecommerce/settings:
 *   get:
 *     summary: Get ecommerce settings
 *     tags: [Ecommerce]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Ecommerce settings including delivery_charges
 *   put:
 *     summary: Update ecommerce settings
 *     tags: [Ecommerce]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               delivery_charges:
 *                 type: object
 *                 properties:
 *                   delivery_charge:
 *                     type: number
 *                     example: 50
 *                   currency:
 *                     type: string
 *                     example: ZAR
 *                   is_enabled:
 *                     type: boolean
 *                     example: true
 *                   free_delivery_minimum:
 *                     type: number
 *                     nullable: true
 *                     example: 500
 *     responses:
 *       200:
 *         description: Ecommerce settings updated
 */
router.get("/settings", getEcommerceSettings);
router.put(
  "/settings",
  validate(updateEcommerceSettingsSchema),
  updateEcommerceSettings
);

module.exports = router;
