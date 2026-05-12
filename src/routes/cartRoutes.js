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
 *   description: Per-user shopping cart for Pooja Kit products
 */

router.get("/", authenticate, getCart);

router.post("/add", authenticate, validate(addItemSchema), addItem);

router.post("/remove", authenticate, validate(removeItemBodySchema), removeItem);

router.put("/update", authenticate, validate(updateQuantitySchema), updateQuantity);

router.delete("/clear", authenticate, clearCart);

/**
 * @swagger
 * /cart/items:
 *   post:
 *     summary: (Legacy) Add an item — same as POST /cart/add
 */
router.post("/items", authenticate, validate(addItemSchema), addItem);

/**
 * @swagger
 * /cart/items:
 *   patch:
 *     summary: (Legacy) Update quantity — same as PUT /cart/update
 */
router.patch("/items", authenticate, validate(updateQuantitySchema), updateQuantity);

router.delete(
  "/items/:productId",
  authenticate,
  validate(removeItemParamsSchema, "params"),
  removeItem
);

router.delete("/", authenticate, clearCart);

module.exports = router;
