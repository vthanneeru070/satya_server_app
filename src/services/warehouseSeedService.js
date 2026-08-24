const Warehouse = require("../models/Warehouse");
const { WAREHOUSE_SEEDS } = require("../constants/warehouses");

/**
 * Upsert canonical pickup warehouses on server start (idempotent).
 */
const ensureWarehousesSeeded = async () => {
  for (const row of WAREHOUSE_SEEDS) {
    await Warehouse.findOneAndUpdate(
      { code: row.code },
      { $set: { ...row, isDeleted: false, isActive: true } },
      { upsert: true }
    );
  }
  console.log("[warehouses] seeded/verified pickup locations");
};

module.exports = { ensureWarehousesSeeded };
