const Joi = require("joi");
const { ADMIN_NOTIFICATION_TYPES } = require("../constants/adminNotificationTypes");

const objectIdHex = Joi.string().trim().hex().length(24);
const typeValues = Object.values(ADMIN_NOTIFICATION_TYPES);

const listAdminNotificationsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
  unreadOnly: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true", "false")),
  type: Joi.string()
    .valid(...typeValues)
    .optional(),
});

const adminNotificationIdParamsSchema = Joi.object({
  id: objectIdHex.required(),
});

module.exports = {
  listAdminNotificationsQuerySchema,
  adminNotificationIdParamsSchema,
};
