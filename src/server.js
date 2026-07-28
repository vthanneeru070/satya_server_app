const app = require("./app");
const connectDatabase = require("./config/db");
const { port } = require("./config/env");
const notificationBroadcastService = require("./services/notificationBroadcastService");
const { ensureWarehousesSeeded } = require("./services/warehouseSeedService");

const startServer = async () => {
  await connectDatabase();
  await ensureWarehousesSeeded().catch((err) =>
    console.warn("[server] warehouse seed failed:", err?.message || err)
  );
  // Scheduler must start AFTER DB connect so scheduled notifications can be
  // queried. Runs every 60s; safe across restarts thanks to atomic claim.
  notificationBroadcastService.startScheduler({ intervalMs: 60_000 });
  try {
    require("./jobs/tcgTrackingSyncJob").startTcgTrackingSyncJob();
  } catch (err) {
    console.warn("[server] TCG tracking sync job not started:", err?.message || err);
  }
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
};

startServer();
