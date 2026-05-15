const constants = require("./constants");
const model = require("./model");
const service = require("./service");
const validation = require("./validation");

module.exports = {
  ...constants,
  model,
  service,
  validation,
  // Primary aliases (used by controllers / services)
  list: service.list,
  seed: service.seed,
  assertValid: service.assertValid,
  // Legacy / explicit names
  listCategories: service.list,
  seedCategories: service.seed,
  assertCategoryValid: service.assertValid,
};
