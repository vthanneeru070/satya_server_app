const express = require("express");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const { warehouseForCartSchema } = require("../validations/warehouseValidation");
const {
  listWarehouses,
  warehouseForCart,
} = require("../controllers/warehouseController");

const router = express.Router();

router.get("/", authenticate, listWarehouses);

router.post(
  "/for-cart",
  authenticate,
  validate(warehouseForCartSchema),
  warehouseForCart
);

router.get(
  "/for-cart",
  authenticate,
  (req, res, next) => {
    const ids = String(req.query.productIds || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    req.body = { productIds: ids };
    return warehouseForCart(req, res, next);
  }
);

module.exports = router;
