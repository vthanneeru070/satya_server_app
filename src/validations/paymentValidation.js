const Joi = require("joi");

const objectIdHex = Joi.string().trim().hex().length(24);

const paymentInitializeSchema = Joi.object({
  orderId: objectIdHex.required(),
  callbackUrl: Joi.string().uri().optional(),
});

const paymentVerifyParamsSchema = Joi.object({
  reference: Joi.string().trim().min(3).max(200).required(),
});

module.exports = {
  paymentInitializeSchema,
  paymentVerifyParamsSchema,
};
