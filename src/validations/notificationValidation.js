const Joi = require("joi");

const objectIdHex = Joi.string().trim().hex().length(24);

const sendNotificationSchema = Joi.object({
  title: Joi.string().trim().min(1).max(120).required(),
  body: Joi.string().trim().min(1).max(1000).required(),
  audience: Joi.string()
    .valid("ALL", "USERS", "ADMINS", "SUPERADMIN", "USER_IDS")
    .default("ALL"),
  userIds: Joi.array()
    .items(objectIdHex)
    .when("audience", {
      is: "USER_IDS",
      then: Joi.array().min(1).required(),
      otherwise: Joi.array().optional(),
    }),
  data: Joi.object().pattern(/.*/, Joi.alternatives(Joi.string(), Joi.number(), Joi.boolean())).optional(),
  imageUrl: Joi.string().uri().optional(),
  scheduledAt: Joi.date().iso().optional(),
});

const listNotificationsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string()
    .valid("PENDING", "SCHEDULED", "SENDING", "SENT", "FAILED", "CANCELLED")
    .optional(),
  audience: Joi.string()
    .valid("ALL", "USERS", "ADMINS", "SUPERADMIN", "USER_IDS")
    .optional(),
});

const notificationIdParamsSchema = Joi.object({
  id: objectIdHex.required(),
});

module.exports = {
  sendNotificationSchema,
  listNotificationsQuerySchema,
  notificationIdParamsSchema,
};
