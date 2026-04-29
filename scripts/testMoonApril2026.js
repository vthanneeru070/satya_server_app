require("dotenv").config();
const { getNasaMoonData } = require("../src/services/nasaMoonService");
const { extractMoonEvents } = require("../src/utils/moonUtils");

const run = async () => {
  const data = await getNasaMoonData(2026);
  const events = extractMoonEvents(data);

  const aprilEvents = events.filter((event) => {
    const month = event.eventTimeUtc.getUTCMonth() + 1;
    return month === 4;
  });

  console.log(`Total extracted events in 2026: ${events.length}`);
  console.log("April 2026 events (UTC):");
  for (const event of aprilEvents) {
    console.log(`${event.type} -> ${event.eventTimeUtc.toISOString()}`);
  }
};

if (require.main === module) {
  run().catch((error) => {
    console.error("Moon April 2026 test failed:", error.message);
    process.exit(1);
  });
}
