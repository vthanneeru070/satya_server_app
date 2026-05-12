const Joi = require("joi");

const objectIdHex = Joi.string().trim().hex().length(24);

const addItemSchema = Joi.object({
  productId: objectIdHex.required(),
  quantity: Joi.number().integer().min(1).max(999).default(1),
});

const updateQuantitySchema = Joi.object({
  productId: objectIdHex.required(),
  quantity: Joi.number().integer().min(1).max(999).required(),
});

const removeItemParamsSchema = Joi.object({
  productId: objectIdHex.required(),
});

const removeItemBodySchema = Joi.object({
  productId: objectIdHex.required(),
});

module.exports = {
  addItemSchema,
  updateQuantitySchema,
  removeItemParamsSchema,
  removeItemBodySchema,
};
