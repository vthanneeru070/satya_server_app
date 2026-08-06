const express = require("express");
const authenticate = require("../middleware/authenticate");
const adminMiddleware = require("../middleware/adminMiddleware");
const { sendSuccess } = require("../utils/response");
const HttpError = require("../utils/httpError");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Ecommerce
 *   description: Legacy store settings (flat delivery fee removed — TCG rates used at checkout)
 */

router.use(authenticate, adminMiddleware);

const REMOVED_MESSAGE =
  "Flat delivery fee settings have been removed. Door-to-door delivery charges come from The Courier Guy (TCG) rates at checkout.";

/**
 * @swagger
 * /admin/ecommerce/settings:
 *   get:
 *     summary: Legacy ecommerce settings (removed)
 *     tags: [Ecommerce]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notice that flat delivery settings are retired
 *   put:
 *     summary: Update ecommerce settings (removed)
 *     tags: [Ecommerce]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       410:
 *         description: Flat delivery settings are no longer supported
 */
router.get("/settings", (req, res) =>
  sendSuccess(
    res,
    {
      delivery_charges: null,
      deliveryFrom: "TCG",
      notice: REMOVED_MESSAGE,
    },
    REMOVED_MESSAGE
  )
);

router.put("/settings", (req, res, next) =>
  next(new HttpError(REMOVED_MESSAGE, 410))
);

module.exports = router;
