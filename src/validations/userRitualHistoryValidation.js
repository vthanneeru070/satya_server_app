const Joi = require("joi");

const objectIdHex = Joi.string().trim().hex().length(24);

const ritualIdParamsSchema = Joi.object({
  ritualId: objectIdHex.required(),
});

const sessionIdParamsSchema = Joi.object({
  sessionId: objectIdHex.required(),
});

const listRitualHistoryQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
  status: Joi.string().valid("PENDING", "FINISHED").optional(),
});

const ritualHistoryOverviewQuerySchema = Joi.object({
  pendingPage: Joi.number().integer().min(1).default(1),
  pendingLimit: Joi.number().integer().min(1).max(50).default(20),
  finishedPage: Joi.number().integer().min(1).default(1),
  finishedLimit: Joi.number().integer().min(1).max(50).default(20),
});

const updateRitualProgressSchema = Joi.object({
  currentStep: Joi.number().integer().min(0).required(),
  currentDay: Joi.number().integer().min(1).optional(),
});

const timeZoneQuerySchema = Joi.object({
  timezone: Joi.string().trim().min(2).max(64).optional(),
});

module.exports = {
  ritualIdParamsSchema,
  sessionIdParamsSchema,
  listRitualHistoryQuerySchema,
  ritualHistoryOverviewQuerySchema,
  updateRitualProgressSchema,
  timeZoneQuerySchema,
};
