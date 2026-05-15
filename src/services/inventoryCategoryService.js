/** @deprecated Import from `src/masterdata` instead. */
const { inventory } = require("../masterdata");

module.exports = {
  listCategories: inventory.categories.list,
  seedCategories: inventory.categories.seed,
  assertCategoryValid: inventory.categories.assertValid,
  list: inventory.categories.list,
  seed: inventory.categories.seed,
  assertValid: inventory.categories.assertValid,
};
