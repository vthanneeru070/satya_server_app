const mongoose = require("mongoose");
const crypto = require("crypto");
const Pooja = require("../src/models/Pooja");

async function main() {
  const { MONGO_URI, NODE_ENV } = process.env;
  if (!MONGO_URI) {
    throw new Error("Missing MONGO_URI in environment");
  }

  console.log(`[migratePoojaScheduleIds] Starting (${NODE_ENV || "env"})...`);
  await mongoose.connect(MONGO_URI);

  // Include:
  // - poojas with legacy `date`
  // - poojas with schedules missing `id`
  const query = {
    $or: [
      { date: { $exists: true } },
      {
        schedules: {
          $elemMatch: {
            $or: [{ id: { $exists: false } }, { id: null }, { id: "" }],
          },
        },
      },
    ],
  };

  const projection = { _id: 1, schedules: 1, date: 1 };

  const cursor = Pooja.find(query).select(projection).lean().cursor();

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    scanned += 1;

    let schedules = Array.isArray(doc.schedules) ? doc.schedules : [];

    // If this is a legacy pooja that only has `date`, convert it.
    if ((!schedules || schedules.length === 0) && doc.date) {
      schedules = [{ date: doc.date, time: "" }];
    }

    if (!Array.isArray(schedules) || schedules.length === 0) {
      skipped += 1;
      continue;
    }

    const nextSchedules = schedules.map((slot) => {
      const hasId = slot && typeof slot === "object" && typeof slot.id === "string" && slot.id.trim();
      return {
        ...slot,
        id: hasId ? String(slot.id).trim() : `sch_${crypto.randomUUID()}`,
      };
    });

    const didNeedUpdate = nextSchedules.some((s, i) => {
      const prev = schedules[i];
      return !(prev && typeof prev.id === "string" && prev.id.trim());
    });

    // If we converted legacy date → schedules, treat that as an update.
    const convertedLegacyDate = doc.date && (!doc.schedules || doc.schedules.length === 0);

    if (!didNeedUpdate && !convertedLegacyDate) {
      skipped += 1;
      continue;
    }

    await Pooja.updateOne(
      { _id: doc._id },
      {
        $set: { schedules: nextSchedules },
        ...(doc.date ? { $unset: { date: "" } } : {}),
      }
    );

    updated += 1;

    if (updated % 100 === 0) {
      console.log(
        `[migratePoojaScheduleIds] updated=${updated} scanned=${scanned} skipped=${skipped}`
      );
    }
  }

  console.log(
    `[migratePoojaScheduleIds] Done. scanned=${scanned} updated=${updated} skipped=${skipped}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[migratePoojaScheduleIds] Failed:", err);
    process.exit(1);
  });

