const Joi = require("joi");

const objectId = Joi.string().trim().hex().length(24).required();

const removeAdminParamsSchema = Joi.object({ id: objectId });
const deleteUserParamsSchema = Joi.object({ id: objectId });
const restoreUserParamsSchema = Joi.object({ id: objectId });

const adminUsersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().allow("").optional(),
  includeDeleted: Joi.boolean().truthy("true").falsy("false").default(false),
  role: Joi.string().valid("admin", "superadmin").optional(),
});

module.exports = {
  removeAdminParamsSchema,
  deleteUserParamsSchema,
  restoreUserParamsSchema,
  adminUsersQuerySchema,
};
