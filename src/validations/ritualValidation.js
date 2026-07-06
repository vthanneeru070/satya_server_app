const Joi = require("joi");

const jsonStringField = Joi.string().trim().min(2);
const jsonObjectOrStringField = (schema) => Joi.alternatives().try(schema, jsonStringField);
const jsonArrayOrStringField = (schema) => Joi.alternatives().try(schema, jsonStringField);

const mediaSchema = Joi.object({
  images: Joi.array().items(Joi.string().trim()).default([]),
  audio: Joi.array().items(Joi.string().trim()).default([]),
  videos: Joi.array().items(Joi.string().trim()).default([]),
});

const ritualContentSchema = Joi.object({
  title: Joi.string().trim().min(1).required(),
  description: Joi.string().trim().allow("").default(""),
  imageUrl: Joi.string().trim().allow("").default(""),
});

const ritualSectionSchema = Joi.object({
  key: Joi.string().trim().min(1).required(),
  label: Joi.string().trim().min(1).required(),
  contents: Joi.array().items(ritualContentSchema).default([]),
});

const ritualDaySchema = Joi.object({
  dayNumber: Joi.number().integer().min(1).required(),
  title: Joi.string().trim().min(1).required(),
  activities: Joi.array().items(Joi.string().trim()).default([]),
  mantra: Joi.string().trim().allow("").default(""),
  affirmation: Joi.string().trim().allow("").default(""),
});

const accessTypeField = Joi.string().trim().valid("FREE", "PAID");
const priceField = Joi.number().min(0);
const currencyField = Joi.string().trim().min(1).max(10);

const objectIdRefItem = Joi.alternatives().try(
  Joi.string().trim().hex().length(24),
  Joi.object({
    _id: Joi.alternatives().try(Joi.string().trim().hex().length(24), Joi.any()),
    id: Joi.string().trim().hex().length(24),
  }).or("_id", "id")
);

const deityField = Joi.alternatives().try(
  Joi.array().items(objectIdRefItem).min(1),
  Joi.string().trim().min(2)
);

const createRitualSchema = Joi.object({
  title: Joi.string().trim().min(2).max(200).required(),
  slug: Joi.string().trim().lowercase().max(200).optional(),
  description: Joi.string().trim().allow("").max(10000).optional(),
  deity: deityField.required(),
  category: Joi.string().trim().max(150).allow("").optional(),
  purpose: Joi.string().trim().max(2000).allow("").optional(),
  ritualDays: Joi.number().integer().min(1).required().messages({
    "number.base": "ritualDays must be a number",
    "any.required": "ritualDays is required",
  }),
  bestDayTime: Joi.string().trim().max(200).allow("").optional(),
  startingDay: Joi.string().trim().max(200).allow("").optional(),
  difficulty: Joi.string().valid("BEGINNER", "INTERMEDIATE", "ADVANCED").default("BEGINNER"),
  sections: jsonArrayOrStringField(Joi.array().items(ritualSectionSchema)).optional(),
  days: jsonArrayOrStringField(Joi.array().items(ritualDaySchema)).optional(),
  media: jsonObjectOrStringField(mediaSchema).optional(),
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
  isFeatured: Joi.boolean().optional(),
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED").optional(),
});

const updateRitualSchema = Joi.object({
  title: Joi.string().trim().min(2).max(200),
  slug: Joi.string().trim().lowercase().max(200),
  description: Joi.string().trim().allow("").max(10000),
  deity: deityField.optional(),
  category: Joi.string().trim().max(150).allow(""),
  purpose: Joi.string().trim().max(2000).allow(""),
  ritualDays: Joi.number().integer().min(1),
  bestDayTime: Joi.string().trim().max(200).allow(""),
  startingDay: Joi.string().trim().max(200).allow(""),
  difficulty: Joi.string().valid("BEGINNER", "INTERMEDIATE", "ADVANCED"),
  sections: jsonArrayOrStringField(Joi.array().items(ritualSectionSchema)),
  days: jsonArrayOrStringField(Joi.array().items(ritualDaySchema)),
  media: jsonObjectOrStringField(mediaSchema),
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
  isFeatured: Joi.boolean(),
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED"),
});

const ritualIdParamsSchema = Joi.object({
  id: Joi.string().trim().hex().length(24).required(),
});

const allRitualsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED").optional(),
  search: Joi.string().trim().max(100).optional(),
});

const reviewRitualSchema = Joi.object({
  status: Joi.string().valid("APPROVED", "REJECTED", "DRAFT", "PENDING").required(),
});

module.exports = {
  createRitualSchema,
  updateRitualSchema,
  reviewRitualSchema,
  ritualIdParamsSchema,
  allRitualsQuerySchema,
};
