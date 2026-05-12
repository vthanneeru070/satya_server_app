const Joi = require("joi");

const objectIdHex = Joi.string().trim().hex().length(24);

const poojaKitItemSchema = Joi.object({
  itemName: Joi.string().trim().min(1).max(150).required(),
  quantity: Joi.string().trim().min(1).max(50).required(),
  unit: Joi.string().trim().min(1).max(30).required(),
});

// Multipart form-data ships nested fields as JSON strings. Accept either a
// proper array OR a JSON-array string and let the controller normalize it.
const itemsField = Joi.alternatives().try(
  Joi.array().items(poojaKitItemSchema).min(1),
  Joi.string().trim().min(2)
);

const numericFromForm = (joiNum) =>
  Joi.alternatives().try(joiNum, Joi.string().trim().pattern(/^-?\d+(\.\d+)?$/));

const createProductSchema = Joi.object({
  title: Joi.string().trim().min(2).max(200).required(),
  slug: Joi.string().trim().lowercase().pattern(/^[a-z0-9-]+$/).max(220).optional(),
  description: Joi.string().trim().allow("").max(5000).optional(),

  items: itemsField.required(),

  stockQuantity: numericFromForm(Joi.number().integer().min(0)).required(),
  price: numericFromForm(Joi.number().min(0)).required(),
  salePrice: numericFromForm(Joi.number().min(0)).optional(),
  currency: Joi.string().trim().uppercase().min(2).max(10).required(),

  deity: objectIdHex.optional().allow("", null),
  category: Joi.string().trim().max(100).optional().allow("", null),

  status: Joi.string().valid("ACTIVE", "INACTIVE").optional(),
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

  stockQuantity: numericFromForm(Joi.number().integer().min(0)),
  price: numericFromForm(Joi.number().min(0)),
  salePrice: numericFromForm(Joi.number().min(0)).allow(null),
  currency: Joi.string().trim().uppercase().min(2).max(10),

  deity: objectIdHex.allow("", null),
  category: Joi.string().trim().max(100).allow("", null),

  status: Joi.string().valid("ACTIVE", "INACTIVE"),
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
  status: Joi.string().valid("ACTIVE", "INACTIVE").optional(),
  isFeatured: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true", "false")).optional(),
  minPrice: Joi.number().min(0).optional(),
  maxPrice: Joi.number().min(0).optional(),
  inStock: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true", "false")).optional(),
  sortBy: Joi.string().valid("createdAt", "price", "title", "purchaseCount").default("createdAt"),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
  includeDeleted: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true", "false")).optional(),
});

const toggleStatusSchema = Joi.object({
  status: Joi.string().valid("ACTIVE", "INACTIVE").required(),
});

const toggleFeaturedSchema = Joi.object({
  isFeatured: Joi.boolean().required(),
});

module.exports = {
  createProductSchema,
  updateProductSchema,
  productIdParamsSchema,
  listProductsQuerySchema,
  toggleStatusSchema,
  toggleFeaturedSchema,
};
