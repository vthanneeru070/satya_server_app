const Joi = require("joi");

const deityIdParamsSchema = Joi.object({
  deityId: Joi.string().trim().hex().length(24).required(),
});

module.exports = {
  deityIdParamsSchema,
};
