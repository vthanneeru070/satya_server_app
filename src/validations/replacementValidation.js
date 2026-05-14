const Joi = require("joi");

const objectIdHex = Joi.string().trim().hex().length(24);

const createReplacementRequestSchema = Joi.object({
  orderId: objectIdHex.required(),
  reason: Joi.string().trim().min(5).max(2000).required(),
  imageUrls: Joi.array().items(Joi.string().trim().uri().max(2048)).max(12).optional(),
});

const replacementRequestIdParamsSchema = Joi.object({
  id: objectIdHex.required(),
});

const adminListReplacementQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string()
    .valid("PENDING", "APPROVED", "REJECTED", "COMPLETED")
    .optional(),
});

const adminDecideReplacementSchema = Joi.object({
  adminRemarks: Joi.string().trim().max(2000).allow("").optional(),
});

const listMyReplacementQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid("PENDING", "APPROVED", "REJECTED", "COMPLETED").optional(),
});

module.exports = {
  createReplacementRequestSchema,
  replacementRequestIdParamsSchema,
  adminListReplacementQuerySchema,
  adminDecideReplacementSchema,
  listMyReplacementQuerySchema,
};
