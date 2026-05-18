const express = require("express");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const { getQuotes } = require("../controllers/shippingController");
const { shippingQuotesSchema } = require("../validations/shippingValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Shipping
 *   description: The Courier Guy delivery quotes (Door-to-Door)
 */

/**
 * @swagger
 * /shipping/quotes:
 *   post:
 *     summary: Get delivery options and prices for an address
 *     description: |
 *       Calls The Courier Guy rates API after the user enters a delivery address.
 *       Returns express (OVN, ~1–2 days) and standard (ECO, ~3–4 days) options with
 *       price and estimated delivery dates. Pass the chosen option as `deliveryOption`
 *       when creating the order.
 *     tags: [Shipping]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [shippingAddress]
 *             properties:
 *               shippingAddress:
 *                 $ref: '#/components/schemas/ShippingAddress'
 *               items:
 *                 type: array
 *                 description: Optional — omit to quote from cart
 *     responses:
 *       200:
 *         description: Delivery options
 */
router.post("/quotes", authenticate, validate(shippingQuotesSchema), getQuotes);

module.exports = router;
