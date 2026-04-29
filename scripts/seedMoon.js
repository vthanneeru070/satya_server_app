require("dotenv").config();
const mongoose = require("mongoose");
const MoonEvent = require("../src/models/MoonEvent");
const { getNasaMoonData } = require("../src/services/nasaMoonService");
const { extractMoonEvents } = require("../src/utils/moonUtils");

const mongoUri = process.env.MONGO_URI;

const seedMoonData = async () => {
  if (!mongoUri) {
    throw new Error("Missing required environment variable: MONGO_URI");
  }

  await mongoose.connect(mongoUri);
  console.log("MongoDB connected successfully");

  try {
    const years = [2026];

    for (const year of years) {
      const nasaData = await getNasaMoonData(year);
      const moonEvents = extractMoonEvents(nasaData);

      if (!moonEvents.length) {
        console.log(`No moon events found for ${year}`);
        continue;
      }

      // Replace the year data to avoid stale events from older detection logic.
      const yearStartUtc = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
      const nextYearStartUtc = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0));
      const deleteResult = await MoonEvent.deleteMany({
        eventTimeUtc: { $gte: yearStartUtc, $lt: nextYearStartUtc },
      });

      const operations = moonEvents.map((event) => ({
        updateOne: {
          filter: { type: event.type, eventTimeUtc: event.eventTimeUtc },
          update: { $set: event },
          upsert: true,
        },
      }));

      const result = await MoonEvent.bulkWrite(operations, { ordered: false });

      const preview = moonEvents
        .slice(0, 5)
        .map((event) => `${event.type}@${event.eventTimeUtc.toISOString()}`)
        .join(", ");

      console.log(
        `Seeded ${year}: removed=${deleteResult.deletedCount || 0}, fetched=${nasaData.length}, extracted=${moonEvents.length}, upserted=${result.upsertedCount || 0}, modified=${result.modifiedCount || 0}`
      );
      console.log(`Extracted preview ${year}: ${preview}`);
    }
  } finally {
    await mongoose.connection.close();
  }
};

if (require.main === module) {
  seedMoonData()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Moon seed failed:", error.message);
      process.exit(1);
    });
}

module.exports = seedMoonData;
