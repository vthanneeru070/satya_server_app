const Order = require("../models/Order");
const { getTcgConfig } = require("../config/tcgConfig");
const tcgClient = require("../integrations/tcg/tcgClient");
const shippingShipmentService = require("../services/shippingShipmentService");
const orderService = require("../services/orderService");

let timer = null;

const syncOpenShipments = async () => {
  const cfg = getTcgConfig();
  if (cfg.useMock) return { scanned: 0, updated: 0 };

  const orders = await Order.find({
    isDeleted: { $ne: true },
    fulfillmentMethod: "DELIVERY",
    orderStatus: { $in: ["SHIPPED", "OUT_FOR_DELIVERY"] },
    "delivery.shipmentId": { $exists: true, $ne: "" },
  }).limit(50);

  let updated = 0;
  for (const order of orders) {
    try {
      const shipment = await tcgClient.getShipment({
        id: order.delivery.shipmentId,
        trackingReference: order.delivery.waybill || undefined,
      });
      const list = Array.isArray(shipment?.shipments)
        ? shipment.shipments
        : Array.isArray(shipment)
          ? shipment
          : shipment
            ? [shipment]
            : [];
      const doc = list[0] || shipment;
      const status = doc?.status;
      if (!status) continue;

      const result = shippingShipmentService.applyTrackingStatus(order, status);
      if (!result.changed && !result.nextOrderStatus) continue;

      await order.save();
      if (result.nextOrderStatus && result.nextOrderStatus !== order.orderStatus) {
        await orderService.updateStatus(
          order._id,
          { status: result.nextOrderStatus, note: `Courier sync: ${status}` },
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
