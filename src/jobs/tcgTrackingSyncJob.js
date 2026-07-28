const Order = require("../models/Order");
const { getTcgConfig } = require("../config/tcgConfig");
const shippingPodService = require("../services/shippingPodService");
const orderService = require("../services/orderService");

let timer = null;

const POD_TERMINAL_STATUSES = new Set([
  shippingPodService.POD_STATUS.PIN_VERIFIED,
  shippingPodService.POD_STATUS.IMAGE_CAPTURED,
  shippingPodService.POD_STATUS.RECIPIENT_DETAILS,
]);

const syncOpenShipments = async () => {
  const cfg = getTcgConfig();
  if (cfg.useMock) {
    // Mock mode still exercises POD parsing using deterministic mock events.
  }

  const orders = await Order.find({
    isDeleted: { $ne: true },
    fulfillmentMethod: "DELIVERY",
    orderStatus: { $in: ["SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "FULFILLED"] },
    "delivery.shipmentId": { $exists: true, $ne: "" },
    $or: [
      { orderStatus: { $in: ["SHIPPED", "OUT_FOR_DELIVERY"] } },
      {
        "delivery.podMethod": { $exists: true, $ne: "" },
        "delivery.pod.status": {
          $nin: [...POD_TERMINAL_STATUSES],
        },
      },
    ],
  }).limit(50);

  let updated = 0;
  for (const order of orders) {
    try {
      const result = await shippingPodService.syncDeliveryPodForOrder(order, {
        fetchAssets: POD_TERMINAL_STATUSES.has(order.delivery?.pod?.status)
          ? !order.delivery?.pod?.digitalPodUrl
          : true,
      });
      if (!result.changed && !result.nextOrderStatus) continue;

      await order.save();
      if (result.nextOrderStatus && result.nextOrderStatus !== order.orderStatus) {
        await orderService.updateStatus(
          order._id,
          {
            status: result.nextOrderStatus,
            note: `Courier sync: ${order.delivery?.status || result.nextOrderStatus}`,
          },
          { actorUserId: null }
        );
      }
      updated += 1;
    } catch (err) {
      console.warn(
        `[tcgTrackingSync] failed for ${order.orderNumber}:`,
        err?.message || err
      );
    }
  }

  return { scanned: orders.length, updated };
};

const startTcgTrackingSyncJob = ({ intervalMs } = {}) => {
  const cfg = getTcgConfig();
  const ms = intervalMs || cfg.trackingSyncIntervalMs || 900000;
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    syncOpenShipments().catch((err) =>
      console.error("[tcgTrackingSync] tick failed:", err?.message || err)
    );
  }, ms);
  // Allow process to exit in tests.
  if (typeof timer.unref === "function") timer.unref();
  console.log(`[tcgTrackingSync] started (interval ${ms}ms)`);
  return timer;
};

module.exports = {
  startTcgTrackingSyncJob,
  syncOpenShipments,
};
