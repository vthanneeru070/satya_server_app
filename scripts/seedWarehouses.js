/**
 * Seed pickup warehouses (Durban + Centurion).
 * Run: node scripts/seedWarehouses.js
 */
require("dotenv").config();
const connectDatabase = require("../src/config/db");
const Warehouse = require("../src/models/Warehouse");
const { WAREHOUSE_SEEDS } = require("../src/constants/warehouses");

const seedWarehouses = async () => {
  await connectDatabase();
  for (const row of WAREHOUSE_SEEDS) {
    await Warehouse.findOneAndUpdate(
      { code: row.code },
      { $set: { ...row, isDeleted: false } },
      { upsert: true, new: true }
    );
    console.log(`[seedWarehouses] upserted ${row.code}`);
  }
  console.log("[seedWarehouses] done");
  process.exit(0);
};

seedWarehouses().catch((err) => {
  console.error("[seedWarehouses] failed:", err);
  process.exit(1);
});
