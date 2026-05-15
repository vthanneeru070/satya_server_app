const InventoryCategory = require("./model");
const { INVENTORY_CATEGORIES } = require("./constants");
const HttpError = require("../../../utils/httpError");

const list = async ({ activeOnly = true } = {}) => {
  const filter = {};
  if (activeOnly) filter.isActive = true;
  return InventoryCategory.find(filter).sort({ sortOrder: 1, code: 1 }).lean();
};

const seed = async () => {
  const ops = INVENTORY_CATEGORIES.map((row) => ({
    updateOne: {
      filter: { code: row.code },
      update: {
        $set: {
          label: row.label,
          sortOrder: row.sortOrder,
          isActive: true,
        },
      },
      upsert: true,
    },
  }));

  const result = await InventoryCategory.bulkWrite(ops, { ordered: false });
  return {
    total: INVENTORY_CATEGORIES.length,
    upserted: result.upsertedCount || 0,
    modified: result.modifiedCount || 0,
    matched: result.matchedCount || 0,
  };
};

const assertValid = async (code) => {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) throw new HttpError("category is required", 400);

  const row = await InventoryCategory.findOne({ code: normalized, isActive: true }).lean();
  if (!row) {
    throw new HttpError(
      `Invalid inventory category "${code}". Use GET /inventory/categories for allowed values.`,
      400
    );
  }
  return normalized;
};

module.exports = {
  list,
  seed,
  assertValid,
};
