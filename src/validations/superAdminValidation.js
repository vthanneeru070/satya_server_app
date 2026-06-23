const Joi = require("joi");

const phonePattern = /^\+?[0-9\s\-]{6,20}$/;

const createDedicatedAdminSchema = Joi.object({
  fullName: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().email({ tlds: { allow: false } }).lowercase().trim().required(),
  phone: Joi.string().trim().pattern(phonePattern).optional().messages({
    "string.pattern.base":
      "phone must be a valid international number (e.g. +919999999999)",
  }),
});

const adminIdParamsSchema = Joi.object({
  id: Joi.string().trim().hex().length(24).required(),
});

const listAdminsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(120).allow("").optional(),
  includeDeleted: Joi.boolean().truthy("true").falsy("false").default(false),
});

module.exports = {
  createDedicatedAdminSchema,
  adminIdParamsSchema,
  listAdminsQuerySchema,
};
