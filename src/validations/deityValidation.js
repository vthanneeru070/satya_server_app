const Joi = require("joi");

const jsonStringField = Joi.string().trim().min(2);
const objectOrJsonString = (schema) => Joi.alternatives().try(schema, jsonStringField);
const arrayOrJsonString = (schema) => Joi.alternatives().try(schema, jsonStringField);

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
  displeases: Joi.array().items(Joi.string().trim()).default([]),
  ideal_time: Joi.array().items(Joi.string().trim()).default([]),
});

const chantingSchema = Joi.object({
  mantra: Joi.string().trim().allow("").optional(),
  repetitions: Joi.string().trim().allow("").optional(),
  benefits: Joi.array().items(Joi.string().trim()).default([]),
  preferred_days: Joi.array().items(Joi.string().trim()).default([]),
  associated_colors: Joi.array().items(Joi.string().trim()).default([]),
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

const devotionalExperienceSchema = Joi.object({
  sign_of_connection: Joi.string().trim().allow("").optional(),
  notes: Joi.string().trim().allow("").optional(),
});

const deityColorField = Joi.string()
  .trim()
  .max(20)
  .pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
  .allow("")
  .messages({
    "string.pattern.base": "deity_color must be a hex color (e.g. #FF5733 or #F00)",
  });

const createDeitySchema = Joi.object({
  name: Joi.string().trim().min(2).max(200).required(),
  alternate_names: arrayOrJsonString(Joi.array().items(Joi.string().trim().min(1))).optional(),
  description: Joi.string().trim().allow("").max(5000).optional(),
  deity_color: deityColorField.optional(),
  roles: arrayOrJsonString(Joi.array().items(Joi.string().trim().min(1))).optional(),
  lineage: objectOrJsonString(lineageSchema).optional(),
  structure: arrayOrJsonString(Joi.array().items(titleDescSchema)).optional(),
  appearance: arrayOrJsonString(Joi.array().items(titleDescSchema)).optional(),
  spiritual_significance: arrayOrJsonString(Joi.array().items(titleDescSchema)).optional(),
  connecting: objectOrJsonString(connectingSchema).optional(),
  chanting: objectOrJsonString(chantingSchema).optional(),
  home_practice: objectOrJsonString(homePracticeSchema).optional(),
  devotional_experience: objectOrJsonString(devotionalExperienceSchema).optional(),
  stories: arrayOrJsonString(Joi.array().items(storiesSchema)).optional(),
  pujas: arrayOrJsonString(Joi.array().items(Joi.string().trim().hex().length(24))).optional(),
  media: objectOrJsonString(mediaSchema).optional(),
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED").optional(),
});

const updateDeitySchema = Joi.object({
  name: Joi.string().trim().min(2).max(200),
  alternate_names: arrayOrJsonString(Joi.array().items(Joi.string().trim().min(1))),
  description: Joi.string().trim().allow("").max(5000),
  deity_color: deityColorField,
  roles: arrayOrJsonString(Joi.array().items(Joi.string().trim().min(1))),
  lineage: objectOrJsonString(lineageSchema),
  structure: arrayOrJsonString(Joi.array().items(titleDescSchema)),
  appearance: arrayOrJsonString(Joi.array().items(titleDescSchema)),
  spiritual_significance: arrayOrJsonString(Joi.array().items(titleDescSchema)),
  connecting: objectOrJsonString(connectingSchema),
  chanting: objectOrJsonString(chantingSchema),
  home_practice: objectOrJsonString(homePracticeSchema),
  devotional_experience: objectOrJsonString(devotionalExperienceSchema),
  stories: arrayOrJsonString(Joi.array().items(storiesSchema)),
  pujas: arrayOrJsonString(Joi.array().items(Joi.string().trim().hex().length(24))),
  media: objectOrJsonString(mediaSchema),
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED"),
});

const deityIdParamsSchema = Joi.object({
  id: Joi.string().trim().hex().length(24).required(),
});

const allDeitiesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  // Allow larger pages for dropdowns / offline that need the full approved set.
  limit: Joi.number().integer().min(1).max(1000).default(10),
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED").optional(),
  search: Joi.string().trim().max(100).optional(),
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
