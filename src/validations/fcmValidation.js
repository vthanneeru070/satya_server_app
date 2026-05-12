const Joi = require("joi");

const registerFcmTokenSchema = Joi.object({
  token: Joi.string().trim().min(20).max(4096).required(),
  deviceId: Joi.string().trim().max(200).optional(),
  platform: Joi.string().trim().valid("android", "ios", "web").optional(),
});

const unregisterFcmTokenSchema = Joi.object({
  token: Joi.string().trim().min(20).max(4096).required(),
});

module.exports = {
  registerFcmTokenSchema,
  unregisterFcmTokenSchema,
};
