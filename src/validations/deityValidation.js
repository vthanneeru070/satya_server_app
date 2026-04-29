const Joi = require("joi");

const titleDescSchema = Joi.object({
  title: Joi.string().trim().min(1).required(),
  description: Joi.string().trim().min(1).required(),
});

const lineageSchema = Joi.object({
  parents: Joi.array().items(Joi.string().trim()).default([]),
  consort: Joi.string().trim().allow("").optional(),
  children: Joi.array().items(Joi.string().trim()).default([]),
  vehicle: Joi.string().trim().allow("").optional(),
  abode: Joi.string().trim().allow("").optional(),
});

const connectingSchema = Joi.object({
  how_to_pray: Joi.string().trim().allow("").optional(),
  what_pleases: Joi.array().items(Joi.string().trim()).default([]),
  ideal_time: Joi.string().trim().allow("").optional(),
});

const chantingSchema = Joi.object({
  mantra: Joi.string().trim().allow("").optional(),
  repetitions: Joi.string().trim().allow("").optional(),
  benefits: Joi.array().items(Joi.string().trim()).default([]),
});

const homePracticeSchema = Joi.object({
  placement: Joi.string().trim().allow("").optional(),
  offerings: Joi.array().items(Joi.string().trim()).default([]),
  do_and_dont: Joi.object({
    do: Joi.array().items(Joi.string().trim()).default([]),
    dont: Joi.array().items(Joi.string().trim()).default([]),
  }).optional(),
});

const storiesSchema = Joi.object({
  title: Joi.string().trim().allow("").required(),
  description: Joi.string().trim().allow("").required(),
});

const mediaSchema = Joi.object({
  images: Joi.array().items(Joi.string().trim()).default([]),
  audio: Joi.array().items(Joi.string().trim()).default([]),
  videos: Joi.array().items(Joi.string().trim()).default([]),
});

const createDeitySchema = Joi.object({
  name: Joi.string().trim().min(2).max(200).required(),
  alternate_names: Joi.array().items(Joi.string().trim().min(1)).default([]),
  description: Joi.string().trim().allow("").max(5000).optional(),
  roles: Joi.array().items(Joi.string().trim().min(1)).default([]),
  lineage: lineageSchema.optional(),
  appearance: Joi.array().items(titleDescSchema).default([]),
  spiritual_significance: Joi.array().items(titleDescSchema).default([]),
  connecting: connectingSchema.optional(),
  chanting: chantingSchema.optional(),
  home_practice: homePracticeSchema.optional(),
  stories: Joi.array().items(storiesSchema).default([]),
  rituals: Joi.array().items(Joi.string().trim().hex().length(24)).default([]),
  media: mediaSchema.default({}),
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED").optional(),
});

const updateDeitySchema = Joi.object({
  name: Joi.string().trim().min(2).max(200),
  alternate_names: Joi.array().items(Joi.string().trim().min(1)),
  description: Joi.string().trim().allow("").max(5000),
  roles: Joi.array().items(Joi.string().trim().min(1)),
  lineage: lineageSchema,
  appearance: Joi.array().items(titleDescSchema),
  spiritual_significance: Joi.array().items(titleDescSchema),
  connecting: connectingSchema,
  chanting: chantingSchema,
  home_practice: homePracticeSchema,
  stories: Joi.array().items(storiesSchema),
  rituals: Joi.array().items(Joi.string().trim().hex().length(24)),
  media: mediaSchema,
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED"),
});

const deityIdParamsSchema = Joi.object({
  id: Joi.string().trim().hex().length(24).required(),
});

const allDeitiesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED").optional(),
});

const reviewDeitySchema = Joi.object({
  status: Joi.string().valid("APPROVED", "REJECTED", "QUEUED", "DRAFT").required(),
});

module.exports = {
  createDeitySchema,
  updateDeitySchema,
  deityIdParamsSchema,
  allDeitiesQuerySchema,
  reviewDeitySchema,
};
