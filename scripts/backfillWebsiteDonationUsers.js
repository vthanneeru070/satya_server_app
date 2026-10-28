/**
 * Link anonymous WEBSITE donations to User accounts when donorEmail matches.
 *
 * Usage (test):
 *   DOTENV_CONFIG_PATH=.env.test node -r dotenv/config scripts/backfillWebsiteDonationUsers.js
 *
 * Dry run (default): prints counts only.
 * Apply:  ... scripts/backfillWebsiteDonationUsers.js --apply
 */
const mongoose = require("mongoose");
const User = require("../src/models/User");
const DonationContribution = require("../src/models/DonationContribution");
const Payment = require("../src/models/Payment");

const apply = process.argv.includes("--apply");

(async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is required");
    process.exit(1);
  }
  await mongoose.connect(uri);

  const orphans = await DonationContribution.find({
    source: "WEBSITE",
    user: null,
    donorEmail: { $nin: [null, ""] },
    isDeleted: { $ne: true },
  })
    .select("_id donorEmail")
    .lean();

  console.log(`Found ${orphans.length} unlinked WEBSITE donation(s)`);

  let linked = 0;
  let skipped = 0;

  for (const row of orphans) {
    const email = String(row.donorEmail || "")
      .trim()
      .toLowerCase();
    if (!email) {
      skipped += 1;
      continue;
    }
    const user = await User.findOne({ email }).select("_id").lean();
    if (!user) {
      skipped += 1;
      continue;
    }

    console.log(
      `${apply ? "LINK" : "WOULD LINK"} ${row._id} → ${user._id} (${email})`
    );
    if (apply) {
      await DonationContribution.updateOne(
        { _id: row._id },
        { $set: { user: user._id } }
      );
      await Payment.updateMany(
        { donationContribution: row._id, user: null },
        { $set: { user: user._id } }
      );
    }
    linked += 1;
  }

  console.log(
    `${apply ? "Linked" : "Would link"} ${linked}; skipped ${skipped}`
  );
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
