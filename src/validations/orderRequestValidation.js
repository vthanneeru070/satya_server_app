const Joi = require("joi");

const objectIdHex = Joi.string().trim().hex().length(24);

const createRequestSchema = Joi.object({
  type: Joi.string()
    .valid("CANCELLATION", "REFUND", "REPLACEMENT")
    .required(),
  reason: Joi.string().trim().max(2000).allow("").default(""),
  attachments: Joi.array()
    .items(Joi.string().trim().uri().max(2048))
    .max(10)
    .optional()
    .default([]),
});

const decideRequestSchema = Joi.object({
  adminNote: Joi.string().trim().max(2000).allow("").optional(),
});

const requestIdParamsSchema = Joi.object({
  requestId: objectIdHex.required(),
});

const orderIdParamsSchema = Joi.object({
  id: objectIdHex.required(),
});

const listRequestsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string()
    .valid("PENDING", "APPROVED", "REJECTED", "COMPLETED")
    .optional(),
  type: Joi.string()
    .valid("CANCELLATION", "REFUND", "REPLACEMENT")
    .optional(),
  user: objectIdHex.optional(),
});

module.exports = {
  createRequestSchema,
  decideRequestSchema,
  requestIdParamsSchema,
  orderIdParamsSchema,
  listRequestsQuerySchema,
};
