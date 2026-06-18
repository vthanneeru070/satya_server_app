const Joi = require("joi");

const numericFromForm = (joiNum) =>
  Joi.alternatives().try(joiNum, Joi.string().trim().pattern(/^\d+(\.\d+)?$/));

const deliveryChargesSchema = Joi.object({
  delivery_charge: numericFromForm(Joi.number().min(0)).optional(),
  currency: Joi.string().trim().uppercase().min(2).max(10).optional(),
  is_enabled: Joi.boolean().optional(),
  free_delivery_minimum: Joi.alternatives()
    .try(numericFromForm(Joi.number().min(0)), Joi.valid(null), Joi.string().valid(""))
    .optional(),
}).min(1);

const updateEcommerceSettingsSchema = Joi.object({
  delivery_charges: deliveryChargesSchema.optional(),
  settings: Joi.object({
    delivery_charges: deliveryChargesSchema.optional(),
  }).optional(),
})
  .or("delivery_charges", "settings")
  .custom((value, helpers) => {
    const nested = value.settings?.delivery_charges;
    if (value.delivery_charges || nested) {
      return value;
    }
    return helpers.error("any.invalid", {
      message: "delivery_charges is required",
    });
  }, "delivery-charges-required");

module.exports = {
  deliveryChargesSchema,
  updateEcommerceSettingsSchema,
};
