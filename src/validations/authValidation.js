const Joi = require("joi");
const { GENDER_VALUES } = require("../utils/userProfile");

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

const logoutSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

const profileFields = {
  fullName: Joi.string().trim().min(2).max(120),
  gender: Joi.string().trim().lowercase().valid(...GENDER_VALUES),
  dateOfBirth: Joi.alternatives().try(Joi.date().iso(), Joi.string().trim()),
  timeOfBirth: Joi.string()
    .trim()
    .pattern(/^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
  placeOfBirth: Joi.string().trim().min(2).max(120),
  countryCode: Joi.string().trim().pattern(/^\+?\d{1,4}$/),
  phone: Joi.string().trim().pattern(/^\d{6,15}$/),
  firstName: Joi.string().trim().max(60).allow("", null),
  lastName: Joi.string().trim().max(60).allow("", null),
  timezone: Joi.string().trim().max(80),
  preferredLanguage: Joi.string().valid("en", "te", "ta", "hi", "kn"),
};

const createProfileSchema = Joi.object({
  fullName: profileFields.fullName.required(),
  gender: profileFields.gender.required(),
  dateOfBirth: profileFields.dateOfBirth.required(),
  timeOfBirth: profileFields.timeOfBirth.required(),
  placeOfBirth: profileFields.placeOfBirth.required(),
  countryCode: profileFields.countryCode.required(),
  phone: profileFields.phone.required(),
  firstName: profileFields.firstName,
  lastName: profileFields.lastName,
  timezone: profileFields.timezone,
  preferredLanguage: profileFields.preferredLanguage,
});

const updateProfileSchema = Joi.object({
  fullName: profileFields.fullName,
  gender: profileFields.gender,
  dateOfBirth: profileFields.dateOfBirth,
  timeOfBirth: profileFields.timeOfBirth,
  placeOfBirth: profileFields.placeOfBirth,
  countryCode: profileFields.countryCode,
  phone: profileFields.phone,
  firstName: profileFields.firstName,
  lastName: profileFields.lastName,
  timezone: profileFields.timezone,
  preferredLanguage: profileFields.preferredLanguage,
});

const deleteAccountSchema = Joi.object({
  refreshToken: Joi.string().optional(),
});

module.exports = {
  refreshTokenSchema,
  logoutSchema,
  createProfileSchema,
  updateProfileSchema,
  deleteAccountSchema,
};
