const Joi = require("joi");

const objectIdHex = Joi.string().trim().hex().length(24);

const cartItemSchema = Joi.object({
  productId: objectIdHex.required(),
  quantity: Joi.number().integer().min(1).max(999).optional(),
});

const warehouseForCartSchema = Joi.object({
  items: Joi.array().items(cartItemSchema).min(1).optional(),
  productIds: Joi.array().items(objectIdHex).min(1).optional(),
}).or("items", "productIds");

module.exports = {
  warehouseForCartSchema,
};
