const Joi = require("joi");
const datePattern = /^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-[0-9]{4}$/;

const createDailySlokaSchema = Joi.object({
  sloka: Joi.string().trim().min(2).max(5000).required(),
  date: Joi.string().trim().pattern(datePattern).required(),
});

const dailySlokaQuerySchema = Joi.object({
  date: Joi.string().trim().pattern(datePattern).optional(),
});

module.exports = {
  createDailySlokaSchema,
  dailySlokaQuerySchema,
};
