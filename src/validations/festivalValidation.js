const Joi = require("joi");

const createFestivalSchema = Joi.object({
  title: Joi.string().trim().min(2).max(150).required(),
  description: Joi.string().trim().allow("").max(3000).optional(),
});

const updateFestivalSchema = Joi.object({
  title: Joi.string().trim().min(2).max(150),
  description: Joi.string().trim().allow("").max(3000),
});

const reviewFestivalSchema = Joi.object({
  status: Joi.string().valid("APPROVED", "REJECTED").required(),
});

const festivalIdParamsSchema = Joi.object({
  id: Joi.string().trim().hex().length(24).required(),
});

module.exports = {
  createFestivalSchema,
  updateFestivalSchema,
  reviewFestivalSchema,
  festivalIdParamsSchema,
};
