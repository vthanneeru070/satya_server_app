const Joi = require("joi");
const ddmmyyyyPattern = /^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-[0-9]{4}$/;

const createFestivalSchema = Joi.object({
  title: Joi.string().trim().min(2).max(150).required(),
  description: Joi.string().trim().allow("").max(3000).optional(),
  date: Joi.string().trim().pattern(ddmmyyyyPattern).required(),
  endDate: Joi.string().trim().pattern(ddmmyyyyPattern).optional(),
  category: Joi.string().valid("MAJOR", "MINOR", "FASTING", "ECLIPSE").optional(),
  isGlobal: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true", "false")).optional(),
  location: Joi.alternatives().try(Joi.object(), Joi.string()).optional(),
  notifyUsers: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true", "false")).optional(),
  notificationDaysBefore: Joi.number().min(0).optional(),
  rituals: Joi.alternatives().try(Joi.array(), Joi.string()).optional(),
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED").optional(),
});

const updateFestivalSchema = Joi.object({
  title: Joi.string().trim().min(2).max(150),
  description: Joi.string().trim().allow("").max(3000),
  date: Joi.string().trim().pattern(ddmmyyyyPattern),
  endDate: Joi.string().trim().pattern(ddmmyyyyPattern),
  category: Joi.string().valid("MAJOR", "MINOR", "FASTING", "ECLIPSE"),
  isGlobal: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true", "false")),
  location: Joi.alternatives().try(Joi.object(), Joi.string()),
  notifyUsers: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true", "false")),
  notificationDaysBefore: Joi.number().min(0),
  rituals: Joi.alternatives().try(Joi.array(), Joi.string()),
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED"),
});

const reviewFestivalSchema = Joi.object({
  status: Joi.string().valid("APPROVED", "REJECTED", "QUEUED","DRAFT").required(),
});

const festivalIdParamsSchema = Joi.object({
  id: Joi.string().trim().hex().length(24).required(),
});

const allFestivalsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED").optional(),
});

module.exports = {
  createFestivalSchema,
  updateFestivalSchema,
  reviewFestivalSchema,
  festivalIdParamsSchema,
  allFestivalsQuerySchema,
};
