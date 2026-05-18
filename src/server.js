const app = require("./app");
const connectDatabase = require("./config/db");
const { port } = require("./config/env");
const notificationBroadcastService = require("./services/notificationBroadcastService");
const {
  startTrackingSyncScheduler,
} = require("./services/courierGuyTrackingSyncService");
const {
  tcgEnabled,
  tcgApiEnv,
  useMock,
  tcgBaseUrl,
} = require("./config/courierGuy");

const startServer = async () => {
  await connectDatabase();
  // Scheduler must start AFTER DB connect so scheduled notifications can be
  // queried. Runs every 60s; safe across restarts thanks to atomic claim.
  notificationBroadcastService.startScheduler({ intervalMs: 60_000 });
  if (tcgEnabled) {
    console.log(
      `[tcg] shipping ${useMock ? "MOCK" : tcgApiEnv} → ${useMock ? "no external API" : tcgBaseUrl}`
    );
    startTrackingSyncScheduler();
  }
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
};

startServer();
