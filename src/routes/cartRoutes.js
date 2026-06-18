const express = require("express");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const {
  getCart,
  addItem,
  updateQuantity,
  removeItem,
  clearCart,
} = require("../controllers/cartController");
const {
  addItemSchema,
  updateQuantitySchema,
  removeItemParamsSchema,
  removeItemBodySchema,
} = require("../validations/cartValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Cart
 *   description: Per-user shopping cart for Pooja Kit products (authenticated)
 */

/**
 * @swagger
 * /cart:
 *   get:
 *     summary: Get the current user's cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart returned with subtotal, deliveryCharge, totalAmount, and deliverySettings
 *       401:
 *         description: Unauthorized
 *   delete:
 *     summary: Clear the entire cart (same as DELETE /cart/clear)
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart cleared
 *       401:
 *         description: Unauthorized
 */
router.get("/", authenticate, getCart);

/**
 * @swagger
 * /cart/add:
 *   post:
 *     summary: Add a product line to the cart (or increase quantity if already present)
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId]
 *             properties:
 *               productId:
 *                 type: string
 *                 description: Product MongoDB ObjectId (24 hex chars)
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 999
 *                 default: 1
 *     responses:
 *       200:
 *         description: Item added
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post("/add", authenticate, validate(addItemSchema), addItem);

/**
 * @swagger
 * /cart/remove:
 *   post:
 *     summary: Remove a product from the cart (body identifies product)
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId]
 *             properties:
 *               productId:
 *                 type: string
 *                 description: Product MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Item removed
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post("/remove", authenticate, validate(removeItemBodySchema), removeItem);

/**
 * @swagger
 * /cart/update:
 *   put:
 *     summary: Set line quantity for a product in the cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId, quantity]
 *             properties:
 *               productId:
 *                 type: string
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 999
 *     responses:
 *       200:
 *         description: Quantity updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.put("/update", authenticate, validate(updateQuantitySchema), updateQuantity);

/**
 * @swagger
 * /cart/clear:
 *   delete:
 *     summary: Remove all items from the cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart cleared
 *       401:
 *         description: Unauthorized
 */
router.delete("/clear", authenticate, clearCart);

/**
 * @swagger
 * /cart/items:
 *   post:
 *     summary: Legacy alias for POST /cart/add
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId]
 *             properties:
 *               productId: { type: string }
 *               quantity: { type: integer, minimum: 1, maximum: 999, default: 1 }
 *     responses:
 *       200:
 *         description: Item added
 *       401:
 *         description: Unauthorized
 *   patch:
 *     summary: Legacy alias for PUT /cart/update
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId, quantity]
 *             properties:
 *               productId: { type: string }
 *               quantity: { type: integer, minimum: 1, maximum: 999 }
 *     responses:
 *       200:
 *         description: Quantity updated
 *       401:
 *         description: Unauthorized
 */
router.post("/items", authenticate, validate(addItemSchema), addItem);

router.patch("/items", authenticate, validate(updateQuantitySchema), updateQuantity);

/**
 * @swagger
 * /cart/items/{productId}:
 *   delete:
 *     summary: Remove one product line from the cart (path identifies product)
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Product MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Item removed
 *       401:
 *         description: Unauthorized
 */
router.delete(
  "/items/:productId",
  authenticate,
  validate(removeItemParamsSchema, "params"),
  removeItem
);

router.delete("/", authenticate, clearCart);

module.exports = router;
