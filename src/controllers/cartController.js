const { sendSuccess } = require("../utils/response");
const cartService = require("../services/cartService");

const getCart = async (req, res, next) => {
  try {
    const cart = await cartService.getCart(req.user.userId);
    return sendSuccess(res, { cart }, "Cart fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const addItem = async (req, res, next) => {
  try {
    const cart = await cartService.addItem(req.user.userId, req.body);
    return sendSuccess(res, { cart }, "Item added to cart");
  } catch (error) {
    return next(error);
  }
};

const updateQuantity = async (req, res, next) => {
  try {
    const cart = await cartService.updateQuantity(req.user.userId, req.body);
    return sendSuccess(res, { cart }, "Cart item quantity updated");
  } catch (error) {
    return next(error);
  }
};

const removeItem = async (req, res, next) => {
  try {
    const cart = await cartService.removeItem(req.user.userId, {
      productId: req.params.productId,
    });
    return sendSuccess(res, { cart }, "Item removed from cart");
  } catch (error) {
    return next(error);
  }
};

const clearCart = async (req, res, next) => {
  try {
    const cart = await cartService.clearCart(req.user.userId);
    return sendSuccess(res, { cart }, "Cart cleared");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getCart,
  addItem,
  updateQuantity,
  removeItem,
  clearCart,
};
