/** @deprecated Import from `src/masterdata` instead. */
const { inventory } = require("../masterdata");

module.exports = {
  listCategories: inventory.categories.list,
  seedCategories: inventory.categories.seed,
  assertCategoryValid: inventory.categories.assertValid,
};
