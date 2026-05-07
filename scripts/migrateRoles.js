/**
 * One-time migration:
 *   1. Convert legacy `isSuperAdmin: true` users → role: "superadmin", canLoginAdminPanel: true.
 *   2. Backfill `canLoginAdminPanel: true` for all existing role: "admin" users.
 *   3. Strip the legacy `isSuperAdmin` field via $unset.
 *
 * Idempotent: safe to run multiple times.
 *
 * Usage:
 *   node scripts/migrateRoles.js
 */
require("dotenv").config();
const mongoose = require("mongoose");

const mongoUri = process.env.MONGO_URI;
const dbName = process.env.SUPER_ADMIN_DB_NAME || "satya_auth";

const run = async () => {
  if (!mongoUri) throw new Error("Missing MONGO_URI in env");

  await mongoose.connect(mongoUri, { dbName });
  console.log(`Connected to ${dbName}`);

  // Use the raw collection so we can interact with the legacy isSuperAdmin field
  // even though the new schema does not declare it.
  const usersCol = mongoose.connection.collection("users");

  // 1) Promote isSuperAdmin: true → role: superadmin, canLoginAdminPanel: true
  const promote = await usersCol.updateMany(
    { isSuperAdmin: true },
    {
      $set: { role: "superadmin", canLoginAdminPanel: true, isDeleted: false },
    }
  );
  console.log(`Promoted to superadmin: matched=${promote.matchedCount} modified=${promote.modifiedCount}`);

  // 2) Existing role: admin → ensure canLoginAdminPanel = true
  const backfillAdmin = await usersCol.updateMany(
    { role: "admin", canLoginAdminPanel: { $ne: true } },
    { $set: { canLoginAdminPanel: true } }
  );
  console.log(
    `Backfilled canLoginAdminPanel for admins: matched=${backfillAdmin.matchedCount} modified=${backfillAdmin.modifiedCount}`
  );

  // 3) Drop the legacy isSuperAdmin field everywhere.
  const cleanup = await usersCol.updateMany(
    { isSuperAdmin: { $exists: true } },
    { $unset: { isSuperAdmin: "" } }
  );
  console.log(`Removed legacy isSuperAdmin: matched=${cleanup.matchedCount} modified=${cleanup.modifiedCount}`);

  await mongoose.connection.close();
};

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}

module.exports = run;
