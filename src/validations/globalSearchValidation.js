const Joi = require("joi");
const { SEARCH_TYPES } = require("../services/globalSearchService");

const globalSearchQuerySchema = Joi.object({
  q: Joi.string().trim().min(2).max(120).required(),
  types: Joi.alternatives().try(
    Joi.string().trim().lowercase(),
    Joi.array().items(Joi.string().valid(...SEARCH_TYPES))
  ),
  limit: Joi.number().integer().min(1).max(25).default(10),
  maxTotal: Joi.number().integer().min(1).max(100).default(50),
});

module.exports = {
  globalSearchQuerySchema,
};
