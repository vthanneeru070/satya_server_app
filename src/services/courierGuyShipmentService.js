const User = require("../models/User");
const Order = require("../models/Order");
const courierGuyClient = require("./courierGuyClient");
const shippingQuoteService = require("./shippingQuoteService");
const HttpError = require("../utils/httpError");
const {
  tcgEnabled,
  useMock,
  collectionAddress,
  collectionContact,
  trackingPublicBaseUrl,
} = require("../config/courierGuy");

const formatPhone = (phone) => {
  const p = String(phone || "").trim();
  if (!p) return "";
  if (p.startsWith("+")) return p;
  if (p.startsWith("0")) return `+27${p.slice(1)}`;
  return `+27${p}`;
};

const buildDeliveryContact = (order, user) => {
  const addr = order.shippingAddress || {};
  return {
    name: addr.fullName || user?.fullName || "Customer",
    email: user?.email || "noreply@satya.app",
    mobile_number: formatPhone(addr.phone || user?.phone),
  };
};

/**
 * Create a TCG shipment after payment. Best-effort — logs errors, does not throw.
 */
const createShipmentForOrder = async (orderId) => {
  if (!tcgEnabled) return { skipped: true, reason: "tcg_not_configured" };

  try {
    const order = await Order.findById(orderId);
    if (!order || order.isDeleted) return { skipped: true, reason: "order_not_found" };
    if (order.delivery?.shipmentId) {
      return { skipped: true, reason: "already_created", shipmentId: order.delivery.shipmentId };
    }
    if (!order.delivery?.serviceLevelCode) {
      return { skipped: true, reason: "no_delivery_option" };
    }

    const user = await User.findById(order.user).select("email fullName phone").lean();
    const kitCount = order.items.reduce((s, l) => s + l.quantity, 0);

    const now = new Date();
    const payload = {
      collection_min_date: now.toISOString(),
      delivery_min_date: now.toISOString(),
      collection_address:
        collectionAddress ||
        (useMock
          ? {
              type: "business",
              company: "Satya Mock Warehouse",
              street_address: "1 Test St",
              city: "Johannesburg",
              code: "2000",
              zone: "GP",
              country: "South Africa",
            }
          : null),
      collection_contact:
        collectionContact ||
        (useMock
          ? {
              name: "Mock Warehouse",
              email: "mock@satya.app",
              mobile_number: "+27820000000",
            }
          : null),
      special_instructions_collection: `Order ${order.orderNumber}`,
      delivery_address: shippingQuoteService.toTcgAddress(order.shippingAddress, {
        company: order.shippingAddress?.fullName,
      }),
      delivery_contact: buildDeliveryContact(order, user),
      parcels: shippingQuoteService.buildParcelsFromQuantity(kitCount),
      opt_in_rates: [],
      opt_in_time_based_rates: [],
      service_level_code: order.delivery.serviceLevelCode,
    };

    const shipment = await courierGuyClient.createShipment(payload);
    const waybill =
      shipment.custom_tracking_reference ||
      shipment.waybill ||
      shipment.tracking_reference ||
      "";

    const trackingUrl = waybill
      ? `${trackingPublicBaseUrl}?waybill=${encodeURIComponent(waybill)}`
      : "";

    order.delivery = {
      ...(order.delivery || {}),
      provider: "THE_COURIER_GUY",
      shipmentId: shipment.id,
      shipmentStatus: shipment.status || "submitted",
      waybill,
      shipmentCreatedAt: new Date(),
      lastSyncedAt: new Date(),
      trackingEvents: [],
    };

    order.tracking = {
      ...(order.tracking || {}),
      courier: "The Courier Guy",
      trackingNumber: waybill || String(shipment.id || ""),
      trackingUrl,
    };

    if (order.orderStatus === "PLACED") {
      order.orderStatus = "PROCESSING";
      order.orderStatusHistory = order.orderStatusHistory || [];
      order.orderStatusHistory.push({
        status: "PROCESSING",
        at: new Date(),
        note: "Courier Guy shipment created — awaiting collection",
      });
    }

    await order.save();

    console.log(
      `[tcg] shipment created for order ${order.orderNumber}: id=${shipment.id} waybill=${waybill}`
    );

    return { shipmentId: shipment.id, waybill, status: shipment.status };
  } catch (err) {
    console.error(
      `[tcg] createShipmentForOrder(${orderId}) failed:`,
      err?.message || err
    );
    return { failed: true, error: err?.message || String(err) };
  }
};

const DELIVERED_TCG_STATUSES = new Set([
  "delivered",
  "delivery-complete",
  "delivery_complete",
  "completed",
]);

const SHIPPED_TCG_STATUSES = new Set([
  "collected",
  "in-transit",
  "in_transit",
  "out-for-delivery",
  "out_for_delivery",
  "at-hub",
  "at_hub",
]);

const mapTcgStatusToOrderStatus = (tcgStatus, trackingEvents = []) => {
  const fromTop = String(tcgStatus || "").toLowerCase();
  if (DELIVERED_TCG_STATUSES.has(fromTop)) return "DELIVERED";
  if (SHIPPED_TCG_STATUSES.has(fromTop)) return "SHIPPED";

  for (const e of trackingEvents || []) {
    const es = String(e?.status || "").toLowerCase();
    if (DELIVERED_TCG_STATUSES.has(es)) return "DELIVERED";
  }
  for (const e of trackingEvents || []) {
    const es = String(e?.status || "").toLowerCase();
    if (SHIPPED_TCG_STATUSES.has(es)) return "SHIPPED";
  }
  return null;
};

/**
 * Sync tracking from TCG for one order. Returns whether order status was advanced.
 */
const syncOrderTracking = async (order) => {
  const shipmentId = order.delivery?.shipmentId;
  if (!shipmentId) return { synced: false };

  const tracking = await courierGuyClient.getTrackingByShipmentId(shipmentId, {
    includeParcels: true,
  });

  const waybill =
    tracking.custom_tracking_reference ||
    order.delivery?.waybill ||
    order.tracking?.trackingNumber;

  const events = (tracking.tracking_events || []).map((e) => ({
    status: e.status,
    message: e.message || "",
    at: e.date ? new Date(e.date) : null,
    location: e.location || "",
  }));

  order.delivery = {
    ...(order.delivery || {}),
    shipmentStatus: tracking.status || order.delivery.shipmentStatus,
    waybill,
    lastSyncedAt: new Date(),
    trackingEvents: events,
  };

  if (waybill) {
    order.tracking = {
      ...(order.tracking || {}),
      courier: "The Courier Guy",
      trackingNumber: waybill,
      trackingUrl:
        order.tracking?.trackingUrl ||
        `${trackingPublicBaseUrl}?waybill=${encodeURIComponent(waybill)}`,
    };
  }

  const targetStatus = mapTcgStatusToOrderStatus(
    tracking.status,
    tracking.tracking_events
  );

  await order.save();
  return { synced: true, targetStatus, tcgStatus: tracking.status, waybill };
};

module.exports = {
  createShipmentForOrder,
  syncOrderTracking,
  mapTcgStatusToOrderStatus,
};
