const Joi = require("joi");

const objectIdHex = Joi.string().trim().hex().length(24);

const poojaKitItemSchema = Joi.object({
  inventoryItem: objectIdHex.required(),
  quantity: Joi.alternatives()
    .try(Joi.number().positive(), Joi.string().trim().pattern(/^\d+(\.\d+)?$/))
    .required(),
});

// Multipart form-data ships nested fields as JSON strings. Accept either a
// proper array OR a JSON-array string and let the controller normalize it.
const itemsField = Joi.alternatives().try(
  Joi.array().items(poojaKitItemSchema).min(1),
  Joi.string().trim().min(2)
);

const numericFromForm = (joiNum) =>
  Joi.alternatives().try(joiNum, Joi.string().trim().pattern(/^-?\d+(\.\d+)?$/));

const REVIEW_STATUSES = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED"];
const CREATE_STATUSES = ["DRAFT", "PENDING"];
const PUBLISH_STATUSES = ["ACTIVE", "INACTIVE"];

const createProductSchema = Joi.object({
  title: Joi.string().trim().min(2).max(200).required(),
  slug: Joi.string().trim().lowercase().pattern(/^[a-z0-9-]+$/).max(220).optional(),
  description: Joi.string().trim().allow("").max(5000).optional(),

  items: itemsField.required(),

  price: numericFromForm(Joi.number().min(0)).required(),
  salePrice: numericFromForm(Joi.number().min(0)).optional(),
  currency: Joi.string().trim().uppercase().min(2).max(10).required(),

  deity: objectIdHex.optional().allow("", null),
  category: Joi.string().trim().max(100).optional().allow("", null),

  // Admins can only save as DRAFT or submit for review (PENDING). Approval
  // is owned by superadmin via the review endpoint.
  status: Joi.string().valid(...CREATE_STATUSES).optional(),
  productStatus: Joi.string().valid(...PUBLISH_STATUSES).optional(),
  isFeatured: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true", "false")).optional(),
}).custom((value, helpers) => {
  if (
    value.salePrice !== undefined &&
    value.salePrice !== null &&
    Number(value.salePrice) > Number(value.price)
  ) {
    return helpers.error("any.invalid", { message: "salePrice must be less than or equal to price" });
  }
  return value;
}, "price-consistency").messages({
  "any.invalid": "salePrice must be less than or equal to price",
});

const updateProductSchema = Joi.object({
  title: Joi.string().trim().min(2).max(200),
  slug: Joi.string().trim().lowercase().pattern(/^[a-z0-9-]+$/).max(220),
  description: Joi.string().trim().allow("").max(5000),

  items: itemsField,

  price: numericFromForm(Joi.number().min(0)),
  salePrice: numericFromForm(Joi.number().min(0)).allow(null),
  currency: Joi.string().trim().uppercase().min(2).max(10),

  deity: objectIdHex.allow("", null),
  category: Joi.string().trim().max(100).allow("", null),

  // Admins editing their own product cannot self-promote past PENDING.
  status: Joi.string().valid(...CREATE_STATUSES),
  productStatus: Joi.string().valid(...PUBLISH_STATUSES),
  isFeatured: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true", "false")),
}).min(1);

const productIdParamsSchema = Joi.object({
  id: objectIdHex.required(),
});

const listProductsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().max(120).optional(),
  deity: objectIdHex.optional(),
  category: Joi.string().trim().max(100).optional(),
  // Admin-only filters; ignored for public viewers in the service layer.
  status: Joi.string().valid(...REVIEW_STATUSES).optional(),
  productStatus: Joi.string().valid(...PUBLISH_STATUSES).optional(),
  isFeatured: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true", "false")).optional(),
  minPrice: Joi.number().min(0).optional(),
  maxPrice: Joi.number().min(0).optional(),
  inStock: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true", "false")).optional(),
  sortBy: Joi.string().valid("createdAt", "price", "title", "purchaseCount").default("createdAt"),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
  includeDeleted: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true", "false")).optional(),
});

const listAllProductsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().max(120).optional(),
  status: Joi.string().valid(...REVIEW_STATUSES).optional(),
  productStatus: Joi.string().valid(...PUBLISH_STATUSES).optional(),
  includeDeleted: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true", "false")).optional(),
});

const reviewProductSchema = Joi.object({
  status: Joi.string().valid("APPROVED", "REJECTED", "QUEUED", "DRAFT").required(),
});

const toggleProductStatusSchema = Joi.object({
  productStatus: Joi.string().valid(...PUBLISH_STATUSES).required(),
});

const toggleFeaturedSchema = Joi.object({
  isFeatured: Joi.boolean().required(),
});

module.exports = {
  createProductSchema,
  updateProductSchema,
  productIdParamsSchema,
  listProductsQuerySchema,
  listAllProductsQuerySchema,
  reviewProductSchema,
  toggleProductStatusSchema,
  toggleFeaturedSchema,
};
