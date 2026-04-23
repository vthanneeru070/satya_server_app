const Joi = require("joi");

const stepsField = Joi.alternatives().try(
  Joi.array().items(Joi.string().trim().min(1)).default([]),
  Joi.string().trim().min(2)
);

const requiredItemsField = Joi.alternatives().try(
  Joi.array().items(Joi.string().trim().min(1)).default([]),
  Joi.string().trim().min(2)
);

const festivalIdsField = Joi.alternatives().try(
  Joi.array().items(Joi.string().trim().hex().length(24)).default([]),
  Joi.string().trim().min(2)
);

const createPoojaSchema = Joi.object({
  title: Joi.string().trim().min(2).max(150).required(),
  deity: Joi.string().trim().min(2).max(150).required(),
  category: Joi.string().trim().min(2).max(150).required(),
  difficulty: Joi.string().trim().min(2).max(100).required(),
  duration: Joi.string().trim().min(1).max(100).required(),
  description: Joi.string().trim().min(5).max(3000).required(),
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED").optional(),
  audioUrl: Joi.string().trim().uri(),
  videoUrl: Joi.string().trim().uri(),
  steps: stepsField,
  requiredItems: requiredItemsField,
  festivalIds: festivalIdsField,
  rating: Joi.number().min(0).max(5),
});

const updatePoojaSchema = Joi.object({
  title: Joi.string().trim().min(2).max(150),
  deity: Joi.string().trim().min(2).max(150),
  category: Joi.string().trim().min(2).max(150),
  difficulty: Joi.string().trim().min(2).max(100),
  duration: Joi.string().trim().min(1).max(100),
  description: Joi.string().trim().min(5).max(3000),
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED"),
  audioUrl: Joi.string().trim().uri(),
  videoUrl: Joi.string().trim().uri(),
  steps: stepsField,
  requiredItems: requiredItemsField,
  festivalIds: festivalIdsField,
  rating: Joi.number().min(0).max(5),
});

const poojaIdParamsSchema = Joi.object({
  id: Joi.string().trim().hex().length(24).required(),
});

const allPoojasQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED").optional(),
});

const reviewPoojaSchema = Joi.object({
  status: Joi.string().valid("APPROVED", "REJECTED", "QUEUED","DRAFT").required(),
});

module.exports = {
  createPoojaSchema,
  updatePoojaSchema,
  reviewPoojaSchema,
  poojaIdParamsSchema,
  allPoojasQuerySchema,
};
