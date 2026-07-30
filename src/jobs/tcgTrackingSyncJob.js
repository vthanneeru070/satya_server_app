const Order = require("../models/Order");
const OrderRequest = require("../models/OrderRequest");
const ReplacementRequest = require("../models/ReplacementRequest");
const { getTcgConfig } = require("../config/tcgConfig");
const shippingPodService = require("../services/shippingPodService");
const shippingShipmentService = require("../services/shippingShipmentService");
const orderService = require("../services/orderService");
const orderRequestService = require("../services/orderRequestService");
const tcgClient = require("../integrations/tcg/tcgClient");

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

const fetchReturnCourierStatus = async (returnShipment) => {
  const shipmentId = String(returnShipment?.shipmentId || "").trim();
  const trackingReference = String(
    returnShipment?.shortTrackingReference || returnShipment?.waybill || ""
  ).trim();
  if (!shipmentId && !trackingReference) return null;
  const shipment = await tcgClient.getShipment({
    id: shipmentId || undefined,
    trackingReference: trackingReference || undefined,
  });
  return shipment?.status || null;
};

/**
 * Poll open refund/replacement return shipments and advance status.
 * REFUND: delivered → markReturnReceived (initiates PayFast refund).
 * REPLACEMENT: delivered → update returnShipment only (admin still fulfils).
 */
const syncOpenReturnShipments = async () => {
  const filter = {
    isDeleted: { $ne: true },
    "returnShipment.shipmentId": { $exists: true, $ne: "" },
    "returnShipment.status": {
      $in: ["RETURN_BOOKED", "RETURN_IN_TRANSIT", "AWAITING_RETURN"],
    },
  };

  const [refundRequests, replacementRequests] = await Promise.all([
    OrderRequest.find({ ...filter, type: "REFUND", status: "AWAITING_RETURN" }).limit(
      40
    ),
    ReplacementRequest.find({
      ...filter,
      status: { $in: ["AWAITING_RETURN", "APPROVED"] },
    }).limit(40),
  ]);

  let updated = 0;
  const scanned = refundRequests.length + replacementRequests.length;

  for (const request of refundRequests) {
    try {
      const status = await fetchReturnCourierStatus(request.returnShipment);
      if (!status) continue;
      const result = await orderRequestService.applyReturnTrackingStatus(
        request._id,
        status
      );
      if (result.changed) updated += 1;
    } catch (err) {
      console.warn(
        `[tcgTrackingSync] refund return sync failed for ${request.requestNumber}:`,
        err?.message || err
      );
    }
  }

  for (const request of replacementRequests) {
    try {
      const status = await fetchReturnCourierStatus(request.returnShipment);
      if (!status) continue;
      const mapped =
        shippingShipmentService.mapShipLogicStatusToReturnShipmentStatus(status);
      if (!mapped) continue;
      const current = request.returnShipment?.status || "";
      if (current === "RETURN_RECEIVED") continue;

      if (mapped === "RETURN_RECEIVED") {
        // Do not auto-unlock replacement fulfilment — admin confirms mark-return-received.
        // Still advance courier status so CMS can see delivery.
        request.returnShipment = {
          ...(request.returnShipment?.toObject?.() || request.returnShipment || {}),
          courierStatus: String(status),
          status:
            current === "RETURN_BOOKED" || current === "AWAITING_RETURN"
              ? "RETURN_IN_TRANSIT"
              : current,
        };
        // Prefer leaving status for admin; if already in transit keep it.
        if (["RETURN_BOOKED", "AWAITING_RETURN"].includes(current)) {
          request.returnShipment.status = "RETURN_IN_TRANSIT";
        }
        await request.save();
        updated += 1;
        continue;
      }

      if (
        mapped === "RETURN_IN_TRANSIT" &&
        ["AWAITING_RETURN", "RETURN_BOOKED"].includes(current)
      ) {
        request.returnShipment = {
          ...(request.returnShipment?.toObject?.() || request.returnShipment || {}),
          status: "RETURN_IN_TRANSIT",
          courierStatus: String(status),
        };
        await request.save();
        updated += 1;
      } else if (request.returnShipment) {
        request.returnShipment.courierStatus = String(status);
        await request.save();
      }
    } catch (err) {
      console.warn(
        `[tcgTrackingSync] replacement return sync failed for ${request.requestNumber}:`,
        err?.message || err
      );
    }
  }

  return { scanned, updated };
};

const runSyncTick = async () => {
  const outbound = await syncOpenShipments();
  const returns = await syncOpenReturnShipments();
  return { outbound, returns };
};

const startTcgTrackingSyncJob = ({ intervalMs } = {}) => {
  const cfg = getTcgConfig();
  const ms = intervalMs || cfg.trackingSyncIntervalMs || 900000;
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    runSyncTick().catch((err) =>
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
  syncOpenReturnShipments,
  runSyncTick,
};
