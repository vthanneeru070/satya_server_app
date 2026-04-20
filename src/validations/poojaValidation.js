const Joi = require("joi");

const createPoojaSchema = Joi.object({
  title: Joi.string().trim().min(2).max(150).required(),
  description: Joi.string().trim().min(5).max(3000).required(),
});

const updatePoojaSchema = Joi.object({
  title: Joi.string().trim().min(2).max(150),
  description: Joi.string().trim().min(5).max(3000),
});

const poojaIdParamsSchema = Joi.object({
  id: Joi.string().trim().hex().length(24).required(),
});

module.exports = {
  createPoojaSchema,
  updatePoojaSchema,
  poojaIdParamsSchema,
};
