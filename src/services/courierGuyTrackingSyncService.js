const Order = require("../models/Order");
const { tcgEnabled, trackingSyncIntervalMs } = require("../config/courierGuy");
const { syncOrderTracking } = require("./courierGuyShipmentService");
const { notifyCustomerOrderStatus } = require("./orderService");

const syncDueOrders = async ({ limit = 40 } = {}) => {
  if (!tcgEnabled) return { processed: 0 };

  const orders = await Order.find({
    isDeleted: { $ne: true },
    "delivery.shipmentId": { $exists: true, $ne: null },
    orderStatus: { $in: ["PLACED", "PROCESSING", "SHIPPED"] },
  })
    .sort({ "delivery.lastSyncedAt": 1 })
    .limit(limit);

  let processed = 0;
  let advanced = 0;

  for (const order of orders) {
    try {
      const before = order.orderStatus;
      const result = await syncOrderTracking(order);
      processed += 1;
      if (result.statusAdvanced) {
        advanced += 1;
        const fresh = await Order.findById(order._id).select("orderStatus").lean();
        if (fresh && fresh.orderStatus !== before) {
          notifyCustomerOrderStatus(order._id, {
            newStatus: fresh.orderStatus,
            note: "Courier tracking update",
          });
        }
      }
    } catch (err) {
      console.warn(
        `[tcg] tracking sync failed for order ${order.orderNumber}:`,
        err?.message || err
      );
    }
  }

  return { processed, advanced };
};

let timer = null;

const startTrackingSyncScheduler = ({ intervalMs = trackingSyncIntervalMs } = {}) => {
  if (!tcgEnabled || timer) return;
  const tick = () => {
    syncDueOrders().catch((err) =>
      console.warn("[tcg] tracking sync tick failed:", err?.message || err)
    );
  };
  tick();
  timer = setInterval(tick, intervalMs);
  console.log(`[tcg] tracking sync scheduler started (every ${intervalMs}ms)`);
};

module.exports = {
  syncDueOrders,
  startTrackingSyncScheduler,
};
