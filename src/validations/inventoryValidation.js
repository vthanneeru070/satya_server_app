const Joi = require("joi");
const { inventory } = require("../masterdata");

const objectIdHex = Joi.string().trim().hex().length(24);

const { inventoryCategoryField } = inventory.categories.validation;

const numericFromForm = (joiNum) =>
  Joi.alternatives().try(joiNum, Joi.string().trim().pattern(/^-?\d+(\.\d+)?$/));

const createInventoryItemSchema = Joi.object({
  name: Joi.string().trim().min(2).max(200).required(),
  slug: Joi.string().trim().lowercase().pattern(/^[a-z0-9-]+$/).max(220).optional(),
  description: Joi.string().trim().allow("").max(5000).optional(),
  category: inventoryCategoryField.required(),
  unit: Joi.string().trim().min(1).max(30).required(),
  stockQuantity: numericFromForm(Joi.number().min(0)).default(0),
  supplierName: Joi.string().trim().max(200).allow("").optional(),
  lowStockThreshold: numericFromForm(Joi.number().integer().min(0)).optional(),
  status: Joi.string().valid("ACTIVE", "INACTIVE").optional(),
});

const updateInventoryItemSchema = Joi.object({
  name: Joi.string().trim().min(2).max(200),
  slug: Joi.string().trim().lowercase().pattern(/^[a-z0-9-]+$/).max(220),
  description: Joi.string().trim().allow("").max(5000),
  category: inventoryCategoryField,
  unit: Joi.string().trim().min(1).max(30),
  stockQuantity: numericFromForm(Joi.number().min(0)),
  supplierName: Joi.string().trim().max(200).allow(""),
  lowStockThreshold: numericFromForm(Joi.number().integer().min(0)),
  status: Joi.string().valid("ACTIVE", "INACTIVE"),
}).min(1);

const inventoryIdParamsSchema = Joi.object({
  id: objectIdHex.required(),
});

const listInventoryQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(120).optional(),
  category: inventoryCategoryField.optional(),
  status: Joi.string().valid("ACTIVE", "INACTIVE").optional(),
  lowStock: Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true", "false")).optional(),
});

const adjustStockSchema = Joi.object({
  delta: Joi.number().required(),
  reason: Joi.string().trim().max(500).allow("").optional(),
});

module.exports = {
  createInventoryItemSchema,
  updateInventoryItemSchema,
  inventoryIdParamsSchema,
  listInventoryQuerySchema,
  adjustStockSchema,
};
