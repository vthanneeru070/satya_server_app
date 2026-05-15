const constants = require("./constants");
const model = require("./model");
const service = require("./service");
const validation = require("./validation");

module.exports = {
  ...constants,
  model,
  service,
  validation,
  // Friendly aliases for callers
  listCategories: service.list,
  seedCategories: service.seed,
  assertCategoryValid: service.assertValid,
};
