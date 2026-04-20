const Joi = require("joi");

const createAdminSchema = Joi.object({
  email: Joi.string().email().required(),
});

const removeAdminParamsSchema = Joi.object({
  id: Joi.string().trim().hex().length(24).required(),
});

const adminUsersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().allow("").optional(),
});

const deleteUserParamsSchema = Joi.object({
  id: Joi.string().trim().hex().length(24).required(),
});

module.exports = {
  createAdminSchema,
  removeAdminParamsSchema,
  adminUsersQuerySchema,
  deleteUserParamsSchema,
};
