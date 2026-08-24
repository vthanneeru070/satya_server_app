const Joi = require("joi");

const numericFromForm = (joiNum) =>
  Joi.alternatives().try(joiNum, Joi.string().trim().pattern(/^\d+(\.\d+)?$/));

const vatSettingsSchema = Joi.object({
  vat_number: Joi.string().trim().allow("").max(64).optional(),
  vat_percent: numericFromForm(Joi.number().min(0).max(100)).optional(),
  currency: Joi.string().trim().uppercase().min(2).max(10).optional(),
  // camelCase aliases
  vatNumber: Joi.string().trim().allow("").max(64).optional(),
  vatPercent: numericFromForm(Joi.number().min(0).max(100)).optional(),
}).min(1);

const updateEcommerceSettingsSchema = Joi.object({
  vat: vatSettingsSchema.optional(),
  settings: Joi.object({
    vat: vatSettingsSchema.optional(),
  }).optional(),
  vat_number: Joi.string().trim().allow("").max(64).optional(),
  vat_percent: numericFromForm(Joi.number().min(0).max(100)).optional(),
  vatNumber: Joi.string().trim().allow("").max(64).optional(),
  vatPercent: numericFromForm(Joi.number().min(0).max(100)).optional(),
  currency: Joi.string().trim().uppercase().min(2).max(10).optional(),
})
  .or(
    "vat",
    "settings",
    "vat_number",
    "vat_percent",
    "vatNumber",
    "vatPercent",
    "currency"
  );

module.exports = {
  vatSettingsSchema,
  updateEcommerceSettingsSchema,
};
