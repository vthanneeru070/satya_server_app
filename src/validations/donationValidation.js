const Joi = require("joi");

const createDonationSchema = Joi.object({
  title: Joi.string().trim().min(2).max(150).required(),
  description: Joi.string().trim().allow("").max(3000).optional(),
});

const updateDonationSchema = Joi.object({
  title: Joi.string().trim().min(2).max(150),
  description: Joi.string().trim().allow("").max(3000),
});

const reviewDonationSchema = Joi.object({
  status: Joi.string().valid("APPROVED", "REJECTED", "QUEUED","DRAFT").required(),
});

const donationIdParamsSchema = Joi.object({
  id: Joi.string().trim().hex().length(24).required(),
});

const allDonationsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string().valid("DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED").optional(),
});

module.exports = {
  createDonationSchema,
  updateDonationSchema,
  reviewDonationSchema,
  donationIdParamsSchema,
  allDonationsQuerySchema,
};
