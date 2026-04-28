const Joi = require("joi");

const festivalIdsField = Joi.alternatives().try(
  Joi.array().items(Joi.string().trim().hex().length(24)).default([]),
  Joi.string().trim().min(2)
);

const keyValueSchema = Joi.object({
  title: Joi.string().trim().allow("").required(),
  description: Joi.string().trim().allow("").required(),
});

const stepSchema = Joi.object({
  stepNumber: Joi.number().integer().min(1).required(),
  title: Joi.string().trim().allow("").required(),
  description: Joi.string().trim().allow("").required(),
  subSteps: Joi.array().items(Joi.string().trim()).default([]),
});

const purposeSchema = Joi.object({
  why: Joi.string().trim().allow("").optional(),
  benefits: Joi.array().items(Joi.string().trim()).default([]),
});

const deitySummarySchema = Joi.object({
  about: Joi.string().trim().allow("").optional(),
  blessings: Joi.array().items(Joi.string().trim()).default([]),
});

const preparationSchema = Joi.object({
  personal: Joi.array().items(Joi.string().trim()).default([]),
  space: Joi.array().items(Joi.string().trim()).default([]),
  items: Joi.array().items(Joi.string().trim()).default([]),
});

const mantraSchema = Joi.object({
  primary: Joi.string().trim().allow("").optional(),
  repetitions: Joi.string().trim().allow("").optional(),
  additional: Joi.array().items(Joi.string().trim()).default([]),
  meaning: Joi.string().trim().allow("").optional(),
});

const spiritualMeaningSchema = Joi.object({
  offeringsMeaning: Joi.array().items(keyValueSchema).default([]),
  actionsMeaning: Joi.array().items(keyValueSchema).default([]),
  otherSymbolism: Joi.array().items(keyValueSchema).default([]),
});

const guidanceSchema = Joi.object({
  mindset: Joi.array().items(Joi.string().trim()).default([]),
  avoid: Joi.array().items(Joi.string().trim()).default([]),
});

const completionSchema = Joi.object({
  closure: Joi.array().items(Joi.string().trim()).default([]),
  integration: Joi.array().items(Joi.string().trim()).default([]),
  benefits: Joi.array().items(Joi.string().trim()).default([]),
});

const mediaSchema = Joi.object({
  images: Joi.array().items(Joi.string().trim().uri()).default([]),
  audio: Joi.array().items(Joi.string().trim().uri()).default([]),
  videos: Joi.array().items(Joi.string().trim().uri()).default([]),
});

const createPoojaSchema = Joi.object({
  title: Joi.string().trim().min(2).max(150).required(),
  deity: Joi.string().trim().hex().length(24).required(),
  category: Joi.string().trim().min(2).max(150).optional(),
  difficulty: Joi.string().trim().min(2).max(100).optional(),
  duration: Joi.string().trim().min(1).max(100).optional(),
  description: Joi.string().trim().min(2).max(3000).optional(),
  purpose: purposeSchema.optional(),
  deitySummary: deitySummarySchema.optional(),
  preparation: preparationSchema.optional(),
  steps: Joi.array().items(stepSchema).default([]),
  mantra: mantraSchema.optional(),
  spiritualMeaning: spiritualMeaningSchema.optional(),
  guidance: guidanceSchema.optional(),
  completion: completionSchema.optional(),
  media: mediaSchema.optional(),
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED").optional(),
  festivalIds: festivalIdsField,
  rating: Joi.number().min(0).max(5),
});

const updatePoojaSchema = Joi.object({
  title: Joi.string().trim().min(2).max(150),
  deity: Joi.string().trim().hex().length(24),
  category: Joi.string().trim().min(2).max(150),
  difficulty: Joi.string().trim().min(2).max(100),
  duration: Joi.string().trim().min(1).max(100),
  description: Joi.string().trim().min(2).max(3000),
  purpose: purposeSchema,
  deitySummary: deitySummarySchema,
  preparation: preparationSchema,
  steps: Joi.array().items(stepSchema),
  mantra: mantraSchema,
  spiritualMeaning: spiritualMeaningSchema,
  guidance: guidanceSchema,
  completion: completionSchema,
  media: mediaSchema,
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED"),
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
