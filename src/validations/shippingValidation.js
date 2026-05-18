const Joi = require("joi");
const { shippingAddressSchema } = require("./orderValidation");

const objectIdHex = Joi.string().trim().hex().length(24);

const shippingQuotesSchema = Joi.object({
  shippingAddress: shippingAddressSchema.required(),
  items: Joi.array()
    .items(
      Joi.object({
        productId: objectIdHex.required(),
        quantity: Joi.number().integer().min(1).max(999).required(),
      })
    )
    .optional(),
  useCart: Joi.boolean().default(true),
});

module.exports = {
  shippingQuotesSchema,
};
