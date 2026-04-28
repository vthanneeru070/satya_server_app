const Joi = require("joi");

const sectionContentSchema = Joi.object({
  title: Joi.string().trim().min(1).required(),
  description: Joi.string().trim().min(1).required(),
});

const sectionTitleSchema = Joi.object({
  key: Joi.string().trim().min(1).required(),
  value: Joi.string().trim().min(1).required(),
});

const sectionSchema = Joi.object({
  key: Joi.string().trim().min(1).required(),
  title: sectionTitleSchema.required(),
  content: Joi.array().items(sectionContentSchema).default([]),
});

const mediaSchema = Joi.object({
  images: Joi.array().items(Joi.string().trim().uri()).default([]),
  audio: Joi.array().items(Joi.string().trim().uri()).default([]),
  videos: Joi.array().items(Joi.string().trim().uri()).default([]),
});

const createDeitySchema = Joi.object({
  name: Joi.string().trim().min(2).max(200).required(),
  alternate_names: Joi.array().items(Joi.string().trim().min(1)).default([]),
  description: Joi.string().trim().allow("").max(5000).optional(),
  roles: Joi.array().items(Joi.string().trim().min(1)).default([]),
  sections: Joi.array().items(sectionSchema).default([]),
  rituals: Joi.array().items(Joi.string().trim().hex().length(24)).default([]),
  media: mediaSchema.default({}),
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED").optional(),
});

const updateDeitySchema = Joi.object({
  name: Joi.string().trim().min(2).max(200),
  alternate_names: Joi.array().items(Joi.string().trim().min(1)),
  description: Joi.string().trim().allow("").max(5000),
  roles: Joi.array().items(Joi.string().trim().min(1)),
  sections: Joi.array().items(sectionSchema),
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
