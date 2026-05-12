const Joi = require("joi");

const objectIdHex = Joi.string().trim().hex().length(24);

const initiateDonationSchema = Joi.object({
  amount: Joi.number().min(10).max(1_000_000).required(),
  currency: Joi.string().trim().uppercase().min(2).max(10).default("ZAR"),
  note: Joi.string().trim().max(280).allow("").optional(),
  callbackUrl: Joi.string().uri().optional(),
});

const listContributionsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  paymentStatus: Joi.string()
    .valid("PENDING", "PAID", "FAILED", "REFUNDED")
    .optional(),
  donation: objectIdHex.optional(),
  user: objectIdHex.optional(),
});

module.exports = {
  initiateDonationSchema,
  listContributionsQuerySchema,
};
