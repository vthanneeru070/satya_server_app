const Joi = require("joi");

const calendarQuerySchema = Joi.object({
  month: Joi.number().integer().min(1).max(12).required(),
  year: Joi.number().integer().min(1970).max(3000).required(),
  timezone: Joi.string().trim().optional(),
});

module.exports = {
  calendarQuerySchema,
};
