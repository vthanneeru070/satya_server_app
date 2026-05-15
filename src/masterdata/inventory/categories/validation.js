const Joi = require("joi");
const { INVENTORY_CATEGORY_CODES } = require("./constants");

const inventoryCategoryField = Joi.string()
  .trim()
  .uppercase()
  .valid(...INVENTORY_CATEGORY_CODES);

module.exports = {
  inventoryCategoryField,
  INVENTORY_CATEGORY_CODES,
};
