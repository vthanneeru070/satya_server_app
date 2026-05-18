const Joi = require("joi");

const objectIdHex = Joi.string().trim().hex().length(24);

const listUserNotificationsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
  unreadOnly: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true", "false")),
});

const userNotificationIdParamsSchema = Joi.object({
  id: objectIdHex.required(),
});

module.exports = {
  listUserNotificationsQuerySchema,
  userNotificationIdParamsSchema,
};
