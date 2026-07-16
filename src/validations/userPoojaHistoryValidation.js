const Joi = require("joi");

const objectIdHex = Joi.string().trim().hex().length(24);

const poojaIdParamsSchema = Joi.object({
  poojaId: objectIdHex.required(),
});

const sessionIdParamsSchema = Joi.object({
  sessionId: objectIdHex.required(),
});

const scheduleIdQuerySchema = Joi.object({
  scheduleId: Joi.string().trim().min(4).max(100).optional(),
});

const listPoojaHistoryQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
  status: Joi.string().valid("PENDING", "FINISHED").optional(),
});

/** GET /user/pooja-history (no status) — counts + both lists */
const poojaHistoryOverviewQuerySchema = Joi.object({
  pendingPage: Joi.number().integer().min(1).default(1),
  pendingLimit: Joi.number().integer().min(1).max(50).default(20),
  finishedPage: Joi.number().integer().min(1).default(1),
  finishedLimit: Joi.number().integer().min(1).max(50).default(20),
});

const updateProgressSchema = Joi.object({
  currentStep: Joi.number().integer().min(0).required(),
});

module.exports = {
  poojaIdParamsSchema,
  sessionIdParamsSchema,
  scheduleIdQuerySchema,
  listPoojaHistoryQuerySchema,
  poojaHistoryOverviewQuerySchema,
  updateProgressSchema,
};
