const Joi = require("joi");

const objectIdHex = Joi.string().trim().hex().length(24);

const paymentInitializeSchema = Joi.object({
  orderId: objectIdHex.required(),
  callbackUrl: Joi.string().uri().optional(),
});

const paymentVerifyParamsSchema = Joi.object({
  reference: Joi.string().trim().min(3).max(200).required(),
});

const listAllPaymentsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(200).optional(),
  reference: Joi.string().trim().max(200).optional(),
  status: Joi.string().valid("PENDING", "SUCCESS", "FAILED").optional(),
  paymentFor: Joi.string().valid("ORDER", "DONATION").optional(),
  user: objectIdHex.optional(),
  order: objectIdHex.optional(),
});

module.exports = {
  paymentInitializeSchema,
  paymentVerifyParamsSchema,
  listAllPaymentsQuerySchema,
};
