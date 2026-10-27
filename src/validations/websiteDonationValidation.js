const Joi = require("joi");

/** Same bounds as authenticated donate; currency fixed to ZAR for PayFast. */
const websiteInitiateDonationSchema = Joi.object({
  amount: Joi.number().min(10).max(1_000_000).required(),
  currency: Joi.string().trim().uppercase().valid("ZAR").default("ZAR"),
  note: Joi.string().trim().max(280).allow("").optional(),
  email: Joi.string().trim().email().max(254).required(),
  nameFirst: Joi.string().trim().max(60).allow("").optional(),
  nameLast: Joi.string().trim().max(60).allow("").optional(),
  /** Optional override; server still validates against allowlisted website origins. */
  callbackUrl: Joi.string().uri({ scheme: ["https"] }).optional(),
  cancelUrl: Joi.string().uri({ scheme: ["https"] }).optional(),
});

module.exports = {
  websiteInitiateDonationSchema,
};
