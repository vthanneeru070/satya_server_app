const Joi = require("joi");
const ddmmyyyyPattern = /^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-[0-9]{4}$/;
const yyyymmddPattern = /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
const datePattern = Joi.alternatives().try(
  Joi.string().trim().pattern(ddmmyyyyPattern),
  Joi.string().trim().pattern(yyyymmddPattern)
);

const createDailySlokaSchema = Joi.object({
  sloka: Joi.string().trim().min(2).max(5000).required(),
  author: Joi.string().trim().max(200).optional().allow(""),
  meaning: Joi.string().trim().max(5000).optional().allow(""),
  date: datePattern.required(),
});

const dailySlokaQuerySchema = Joi.object({
  date: datePattern.optional(),
});

module.exports = {
  createDailySlokaSchema,
  dailySlokaQuerySchema,
};
