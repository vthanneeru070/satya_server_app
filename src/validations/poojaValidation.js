const Joi = require("joi");
const ddmmyyyyPattern = /^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-[0-9]{4}$/;

const jsonStringField = Joi.string().trim().min(2);
const jsonObjectOrStringField = (schema) => Joi.alternatives().try(schema, jsonStringField);
const jsonArrayOrStringField = (schema) => Joi.alternatives().try(schema, jsonStringField);


const festivalIdsField = Joi.alternatives().try(
  Joi.array().items(Joi.string().trim().hex().length(24)).default([]),
  Joi.string().trim().min(2)
);
const blessingsField = Joi.alternatives().try(
  Joi.array().items(Joi.string().trim().min(1)).default([]),
  Joi.string().trim().min(1)
);

const keyValueSchema = Joi.object({
  title: Joi.string().trim().allow("").required(),
  description: Joi.string().trim().allow("").required(),
});

const stepSchema = Joi.object({
  stepNumber: Joi.number().integer().min(1).required(),
  title: Joi.string().trim().allow("").required(),
  description: Joi.string().trim().allow("").required(),
  subSteps: Joi.array().items(Joi.string().trim()).default([]),
});

const purposeSchema = Joi.object({
  why: Joi.string().trim().allow("").optional(),
  benefits: Joi.array().items(Joi.string().trim()).default([]),
});

const deitySummarySchema = Joi.object({
  about: Joi.string().trim().allow("").optional(),
  blessings: Joi.array().items(Joi.string().trim()).default([]),
});

const preparationSchema = Joi.object({
  personal: Joi.array().items(Joi.string().trim()).default([]),
  space: Joi.array().items(Joi.string().trim()).default([]),
  items: Joi.array().items(Joi.string().trim()).default([]),
});

const mantraSchema = Joi.object({
  primary: Joi.string().trim().allow("").optional(),
  repetitions: Joi.string().trim().allow("").optional(),
  additional: Joi.array().items(Joi.string().trim()).default([]),
  meaning: Joi.string().trim().allow("").optional(),
});

const spiritualMeaningSchema = Joi.object({
  offeringsMeaning: Joi.array().items(keyValueSchema).default([]),
  actionsMeaning: Joi.array().items(keyValueSchema).default([]),
  otherSymbolism: Joi.array().items(keyValueSchema).default([]),
});

const guidanceSchema = Joi.object({
  mindset: Joi.array().items(Joi.string().trim()).default([]),
  avoid: Joi.array().items(Joi.string().trim()).default([]),
});

const completionSchema = Joi.object({
  closure: Joi.array().items(Joi.string().trim()).default([]),
  integration: Joi.array().items(Joi.string().trim()).default([]),
  benefits: Joi.array().items(Joi.string().trim()).default([]),
});

const mediaSchema = Joi.object({
  images: Joi.array().items(Joi.string().trim()).default([]),
  audio: Joi.array().items(Joi.string().trim()).default([]),
  videos: Joi.array().items(Joi.string().trim()).default([]),
});

// Pricing fields with cross-field validation:
//   • When accessType === "PAID"  → price must be > 0 AND currency must be non-empty.
//   • When accessType === "FREE"  → price/currency optional (default 0 / "ZAR").
// For multipart/form-data, numeric strings like "499" come in as strings, so we
// coerce via Joi's default number-string handling.
const accessTypeField = Joi.string().trim().valid("FREE", "PAID");
const priceField = Joi.number().min(0);
const currencyField = Joi.string().trim().min(1).max(10);

const createPoojaSchema = Joi.object({
  title: Joi.string().trim().min(2).max(150).required(),
  date: Joi.string().trim().pattern(ddmmyyyyPattern).required(),
  deity: Joi.string().trim().hex().length(24).required(),
  category: Joi.string().trim().min(2).max(150).optional(),
  difficulty: Joi.string().trim().min(2).max(100).optional(),
  duration: Joi.string().trim().min(1).max(100).optional(),
  description: Joi.string().trim().min(2).max(3000).optional(),
  accessType: accessTypeField.default("FREE"),
  price: priceField.when("accessType", {
    is: "PAID",
    then: Joi.number().greater(0).required().messages({
      "number.base": "price must be a number when accessType is PAID",
      "number.greater": "price must be greater than 0 when accessType is PAID",
      "any.required": "price is required when accessType is PAID",
    }),
    otherwise: Joi.number().min(0).default(0),
  }),
  currency: currencyField.when("accessType", {
    is: "PAID",
    then: Joi.string().trim().min(1).required().messages({
      "string.empty": "currency is required when accessType is PAID",
      "any.required": "currency is required when accessType is PAID",
    }),
    otherwise: Joi.string().trim().default("ZAR"),
  }),
  purpose: jsonObjectOrStringField(purposeSchema).optional(),
  deitySummary: jsonObjectOrStringField(deitySummarySchema).optional(),
  preparation: jsonObjectOrStringField(preparationSchema).optional(),
  steps: jsonArrayOrStringField(Joi.array().items(stepSchema)).optional(),
  mantra: jsonObjectOrStringField(mantraSchema).optional(),
  spiritualMeaning: jsonObjectOrStringField(spiritualMeaningSchema).optional(),
  guidance: jsonObjectOrStringField(guidanceSchema).optional(),
  completion: jsonObjectOrStringField(completionSchema).optional(),
  media: jsonObjectOrStringField(mediaSchema).optional(),
  blessings: blessingsField,
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED").optional(),
  festivalIds: festivalIdsField,
  rating: Joi.number().min(0).max(5),
});

// On update, the payload may omit accessType (e.g. only changing price), so the
// `when` clause can only validate the rows present in this request. The
// controller performs the final cross-check against the existing pooja record
// to catch cases like "flip to PAID without sending a price".
const updatePoojaSchema = Joi.object({
  title: Joi.string().trim().min(2).max(150),
  date: Joi.string().trim().pattern(ddmmyyyyPattern),
  deity: Joi.string().trim().hex().length(24),
  category: Joi.string().trim().min(2).max(150),
  difficulty: Joi.string().trim().min(2).max(100),
  duration: Joi.string().trim().min(1).max(100),
  description: Joi.string().trim().min(2).max(3000),
  accessType: accessTypeField,
  price: priceField.when("accessType", {
    is: "PAID",
    then: Joi.number().greater(0).required().messages({
      "number.greater": "price must be greater than 0 when accessType is PAID",
      "any.required": "price is required when accessType is PAID",
    }),
    otherwise: Joi.number().min(0),
  }),
  currency: currencyField.when("accessType", {
    is: "PAID",
    then: Joi.string().trim().min(1).required().messages({
      "string.empty": "currency is required when accessType is PAID",
      "any.required": "currency is required when accessType is PAID",
    }),
    otherwise: Joi.string().trim(),
  }),
  purpose: jsonObjectOrStringField(purposeSchema),
  deitySummary: jsonObjectOrStringField(deitySummarySchema),
  preparation: jsonObjectOrStringField(preparationSchema),
  steps: jsonArrayOrStringField(Joi.array().items(stepSchema)),
  mantra: jsonObjectOrStringField(mantraSchema),
  spiritualMeaning: jsonObjectOrStringField(spiritualMeaningSchema),
  guidance: jsonObjectOrStringField(guidanceSchema),
  completion: jsonObjectOrStringField(completionSchema),
  media: jsonObjectOrStringField(mediaSchema),
  blessings: blessingsField,
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED"),
  festivalIds: festivalIdsField,
  rating: Joi.number().min(0).max(5),
});

const poojaIdParamsSchema = Joi.object({
  id: Joi.string().trim().hex().length(24).required(),
});

const allPoojasQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED").optional(),
});

const reviewPoojaSchema = Joi.object({
  status: Joi.string().valid("APPROVED", "REJECTED", "QUEUED","DRAFT").required(),
});

module.exports = {
  createPoojaSchema,
  updatePoojaSchema,
  reviewPoojaSchema,
  poojaIdParamsSchema,
  allPoojasQuerySchema,
};
