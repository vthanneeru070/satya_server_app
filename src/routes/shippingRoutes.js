const express = require("express");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const { shippingQuoteSchema } = require("../validations/orderValidation");
const {
  quoteShipping,
  getPickupLocation,
  tcgWebhook,
} = require("../controllers/shippingController");

const router = express.Router();

/**
 * @swagger
 * /shipping/quote:
 *   post:
 *     summary: Get The Courier Guy (ShipLogic) door-to-door rates
 *     tags: [Shipping]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/quote",
  authenticate,
  validate(shippingQuoteSchema),
  quoteShipping
);

/**
 * @swagger
 * /shipping/pickup-location:
 *   get:
 *     summary: Warehouse location for come-and-pickup orders
 *     tags: [Shipping]
 *     security:
 *       - bearerAuth: []
 */
router.get("/pickup-location", authenticate, getPickupLocation);

/**
 * Public webhook for ShipLogic tracking events.
 * Configure in ShipLogic: Settings → Webhook subscriptions.
 */
router.post("/webhooks/tcg", tcgWebhook);

module.exports = router;
