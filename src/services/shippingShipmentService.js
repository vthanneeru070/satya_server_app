const Order = require("../models/Order");
const HttpError = require("../utils/httpError");
const { getTcgConfig, requireCollectionConfig } = require("../config/tcgConfig");
const tcgClient = require("../integrations/tcg/tcgClient");
const {
  toShipLogicAddress,
  defaultParcels,
  todayIsoDate,
} = require("./shippingQuoteService");
const {
  applyPodFromEvents,
  normalizeTrackingEvents,
} = require("./shippingPodService");

const mapShipLogicStatusToOrderStatus = (status) => {
  const s = String(status || "").toLowerCase();
  if (s === "out-for-delivery") return "OUT_FOR_DELIVERY";
  if (s === "delivered") return "DELIVERED";
  if (["cancelled", "returned-to-sender", "undeliverable"].includes(s)) {
    return null; // alert only — do not auto-cancel
  }
  return null; // remain SHIPPED / current
};

const buildTrackingUrl = (waybill) => {
  if (!waybill) return "";
  const cfg = getTcgConfig();
  return `${cfg.trackingPublicBaseUrl}?waybill=${encodeURIComponent(waybill)}`;
};

/**
 * Book a Door-to-Door shipment for an order. Idempotent if delivery.shipmentId exists.
 */
const bookShipmentForOrder = async (order, { actorUserId } = {}) => {
  if (!order) throw new HttpError("Order not found", 404);
  if (order.fulfillmentMethod === "PICKUP") {
    throw new HttpError("Pickup orders cannot be booked with The Courier Guy", 400);
  }
  if (order.delivery?.shipmentId) {
    const exists = await shipmentExistsRemotely(order);
    if (exists) return order;
    console.warn(
      `[shippingShipment] stale shipment ${order.delivery.shipmentId} on ${order.orderNumber} — rebooking`
    );
    clearCourierShipmentFields(order);
  }
  if (!order.shippingAddress) {
    throw new HttpError("Order has no shipping address", 400);
  }
  if (!order.shippingQuote?.serviceLevelCode) {
    throw new HttpError(
      "Order has no shipping quote. Customer must select a Courier Guy service at checkout.",
      400
    );
  }

  const cfg = requireCollectionConfig();
  const deliveryAddress = toShipLogicAddress(order.shippingAddress, {
    type: "residential",
  });
  const contactPhone = String(order.shippingAddress.phone || "").trim();
  const contactName = order.shippingAddress.fullName || "Customer";
  const podMethod = String(cfg.podMethod || "").trim();
  const podEnabled = podMethod && podMethod.toLowerCase() !== "none";

  if (podEnabled && !contactPhone) {
    throw new HttpError(
      "Customer phone number is required for Courier Guy delivery PIN verification",
      400
    );
  }

  const payload = {
    collection_address: cfg.collectionAddress,
    collection_contact: cfg.collectionContact,
    delivery_address: deliveryAddress,
    delivery_contact: {
      name: contactName,
      mobile_number: contactPhone,
      email: "",
    },
    parcels: defaultParcels(cfg),
    opt_in_rates: [],
    opt_in_time_based_rates: [],
    special_instructions_collection: "",
    special_instructions_delivery: "",
    collection_min_date: `${todayIsoDate()}T00:00:00.000Z`,
    delivery_min_date: `${todayIsoDate()}T00:00:00.000Z`,
    customer_reference_name: "Order no.",
    customer_reference: order.orderNumber,
    service_level_code: order.shippingQuote.serviceLevelCode,
    mute_notifications: false,
  };

  if (podEnabled) {
    payload.pod_method = podMethod;
  }

  console.info(
    `[shippingShipment] booking TCG shipment for ${order.orderNumber} (${order.shippingQuote.serviceLevelCode})` +
      (podEnabled ? ` with POD ${podMethod}` : "")
  );

  const created = await tcgClient.createShipment(payload);
  const shipmentId = created?.id ?? created?.shipment_id ?? null;
  const waybill =
    created?.custom_tracking_reference ||
    created?.short_tracking_reference ||
    String(shipmentId || "");
  const shortRef = created?.short_tracking_reference || "";
  const status = created?.status || "submitted";
  const trackingReference = waybill || shortRef;
  const labelUrl =
    shipmentId && trackingReference
      ? tcgClient.getLabelUrl({ id: shipmentId, trackingReference })
      : "";

  order.delivery = {
    ...(order.delivery?.toObject?.() || order.delivery || {}),
    provider: "TCG",
    shipmentId: shipmentId != null ? String(shipmentId) : "",
    waybill,
    shortTrackingReference: shortRef,
    labelUrl,
    stickerUrl: "",
    status,
    bookedAt: new Date(),
    lastSyncedAt: new Date(),
    bookedBy: actorUserId || null,
    podMethod: podEnabled ? podMethod : "",
    pod: podEnabled
      ? {
          status: "pending",
          message: "Awaiting proof of delivery",
          verifiedAt: null,
          digitalPodUrl: "",
          imageUrls: [],
          imageFileNames: [],
          lastSyncedAt: new Date(),
        }
      : undefined,
  };

  order.tracking = {
    ...(order.tracking?.toObject?.() || order.tracking || {}),
    courier: "The Courier Guy",
    trackingNumber: waybill,
    trackingUrl: buildTrackingUrl(waybill),
  };

  return order;
};

const cancelShipmentForOrder = async (order) => {
  if (!order?.delivery?.shipmentId && !order?.delivery?.waybill) {
    return { cancelled: false, reason: "no_shipment" };
  }
  try {
    await tcgClient.cancelShipment({
      id: order.delivery.shipmentId ? Number(order.delivery.shipmentId) || order.delivery.shipmentId : undefined,
      trackingReference: order.delivery.waybill || order.delivery.shortTrackingReference,
    });
    order.delivery = {
      ...(order.delivery?.toObject?.() || order.delivery || {}),
      status: "cancelled",
      lastSyncedAt: new Date(),
    };
    return { cancelled: true };
  } catch (err) {
    console.error(
      `[shippingShipment] cancel failed for ${order.orderNumber}:`,
      err?.message || err
    );
    return { cancelled: false, reason: err?.message || "cancel_failed" };
  }
};

/**
 * Apply a ShipLogic tracking status onto an order document (mutates, does not save).
 * Returns { changed, nextOrderStatus } where nextOrderStatus may be null.
 */
const applyTrackingStatus = (order, shipLogicStatus) => {
  const status = String(shipLogicStatus || "").toLowerCase();
  if (!status) return { changed: false, nextOrderStatus: null };

  const prev = order.delivery?.status || "";
  order.delivery = {
    ...(order.delivery?.toObject?.() || order.delivery || {}),
    status,
    lastSyncedAt: new Date(),
  };

  const mapped = mapShipLogicStatusToOrderStatus(status);
  let nextOrderStatus = null;
  if (mapped === "OUT_FOR_DELIVERY" && ["SHIPPED", "PROCESSING"].includes(order.orderStatus)) {
    nextOrderStatus = "OUT_FOR_DELIVERY";
  } else if (
    mapped === "DELIVERED" &&
    ["SHIPPED", "OUT_FOR_DELIVERY"].includes(order.orderStatus)
  ) {
    nextOrderStatus = "DELIVERED";
  }

  return {
    changed: prev !== status || Boolean(nextOrderStatus),
    nextOrderStatus,
    alert:
      ["cancelled", "returned-to-sender", "undeliverable"].includes(status) ||
      false,
  };
};

/**
 * Apply shipment status and POD tracking events onto an order (mutates, does not save).
 */
const applyTrackingUpdate = (order, { status, trackingEvents = [], payload } = {}) => {
  const events =
    trackingEvents.length > 0
      ? trackingEvents
      : normalizeTrackingEvents(payload || {});

  const statusResult = status
    ? applyTrackingStatus(order, status)
    : { changed: false, nextOrderStatus: null, alert: false };

  const podResult = applyPodFromEvents(order, events);

  return {
    changed: statusResult.changed || podResult.changed,
    nextOrderStatus: statusResult.nextOrderStatus,
    alert: statusResult.alert,
    podStatus: podResult.podStatus,
  };
};

const findOrderByShipmentPayload = async (payload = {}) => {
  const shipmentId = payload.shipment_id ?? payload.id ?? payload.shipmentId;
  const waybill =
    payload.custom_tracking_reference ||
    payload.shipment_tracking_reference ||
    payload.short_tracking_reference ||
    payload.tracking_reference;

  const or = [];
  if (shipmentId != null && String(shipmentId).trim()) {
    or.push({ "delivery.shipmentId": String(shipmentId) });
  }
  if (waybill) {
    or.push({ "delivery.waybill": String(waybill) });
    or.push({ "tracking.trackingNumber": String(waybill) });
  }
  if (!or.length) return null;

  return Order.findOne({ isDeleted: { $ne: true }, $or: or });
};

const isShipmentMissingError = (err) => {
  const msg = String(err?.message || "").toLowerCase();
  return (
    err?.statusCode === 404 ||
    msg.includes("could not find shipment") ||
    msg.includes("shipment was not found") ||
    msg.includes("shipment not found")
  );
};

const clearCourierShipmentFields = (order) => {
  order.delivery = {
    ...(order.delivery?.toObject?.() || order.delivery || {}),
    provider: "TCG",
    shipmentId: "",
    waybill: "",
    shortTrackingReference: "",
    labelUrl: "",
    stickerUrl: "",
    status: "",
    bookedAt: null,
    lastSyncedAt: null,
    bookedBy: null,
    podMethod: order.delivery?.podMethod || "",
    pod: order.delivery?.pod,
  };
  if (order.tracking?.courier === "The Courier Guy") {
    order.tracking = {
      ...(order.tracking?.toObject?.() || order.tracking || {}),
      courier: "",
      trackingNumber: "",
      trackingUrl: "",
    };
  }
};

const shipmentExistsRemotely = async (order) => {
  const cfg = getTcgConfig();
  if (cfg.useMock) {
    const { getMockShipment } = require("./tcgMock");
    try {
      await getMockShipment({
        id: order.delivery?.shipmentId,
        trackingReference: resolveShipmentTrackingReference(order),
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  const shipmentId = String(order.delivery?.shipmentId || "").trim();
  if (!shipmentId) return false;

  const trackingReference = resolveShipmentTrackingReference(order);
  try {
    await tcgClient.getShipment({
      id: shipmentId,
      ...(trackingReference ? { trackingReference } : {}),
    });
    return true;
  } catch (err) {
    if (isShipmentMissingError(err)) return false;
    throw err;
  }
};

/** Clear a stale/mock shipment and book a fresh one with ShipLogic. */
const rebookCourierShipmentForOrder = async (order, { actorUserId } = {}) => {
  if (!order) throw new HttpError("Order not found", 404);
  clearCourierShipmentFields(order);
  await bookShipmentForOrder(order, { actorUserId });
  return order;
};

const resolveShipmentTrackingReference = (order = {}) => {
  const delivery = order.delivery || {};
  const tracking = order.tracking || {};
  const shipmentId = String(delivery.shipmentId || "").trim();
  const candidates = [
    delivery.shortTrackingReference,
    delivery.waybill,
    tracking.trackingNumber,
  ];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (!value) continue;
    if (shipmentId && value === shipmentId) continue;
    return value;
  }
  return "";
};

const resolveShipmentLabelContext = async (order) => {
  if (!order) throw new HttpError("Order not found", 404);
  const shipmentId = String(order.delivery?.shipmentId || "").trim();
  let trackingReference = resolveShipmentTrackingReference(order);

  if (shipmentId && !trackingReference) {
    try {
      const shipment = await tcgClient.getShipment({ id: shipmentId });
      trackingReference = String(
        shipment?.short_tracking_reference ||
          shipment?.custom_tracking_reference ||
          shipment?.shipment_tracking_reference ||
          shipment?.tracking_reference ||
          ""
      ).trim();
      if (trackingReference) {
        order.delivery = {
          ...(order.delivery?.toObject?.() || order.delivery || {}),
          waybill: order.delivery?.waybill || trackingReference,
          shortTrackingReference:
            order.delivery?.shortTrackingReference ||
            shipment?.short_tracking_reference ||
            "",
        };
      }
    } catch (err) {
      console.warn(
        "[shippingShipment] could not resolve tracking reference from ShipLogic:",
        err?.message || err
      );
    }
  }

  if (!shipmentId || !trackingReference) {
    throw new HttpError(
      "Order has no Courier Guy shipment id or tracking reference for label download",
      400
    );
  }

  return { shipmentId, trackingReference };
};

const persistLabelUrl = (order, shipmentId, trackingReference) => {
  order.delivery = {
    ...(order.delivery?.toObject?.() || order.delivery || {}),
    labelUrl: tcgClient.getLabelUrl({ id: shipmentId, trackingReference }),
  };
};

/**
 * Fetch label PDF bytes or a signed redirect URL from ShipLogic.
 */
const getShippingLabelAssetForOrder = async (order, { rebookIfMissing = false } = {}) => {
  try {
    const { shipmentId, trackingReference } = await resolveShipmentLabelContext(order);
    const asset = await tcgClient.fetchLabelAsset({
      id: shipmentId,
      trackingReference,
    });
    persistLabelUrl(order, shipmentId, trackingReference);
    return { ...asset, shipmentId, trackingReference };
  } catch (err) {
    if (rebookIfMissing && isShipmentMissingError(err)) {
      await rebookCourierShipmentForOrder(order);
      return getShippingLabelAssetForOrder(order, { rebookIfMissing: false });
    }
    throw err;
  }
};

/**
 * Fetch a signed ShipLogic label URL (valid ~24h). Requires shipment id + waybill.
 */
const getShippingLabelUrlForOrder = async (order) => {
  const asset = await getShippingLabelAssetForOrder(order);
  if (asset.type === "redirect") {
    return {
      url: asset.url,
      shipmentId: asset.shipmentId,
      trackingReference: asset.trackingReference,
    };
  }
  return {
    url: `data:application/pdf;base64,${asset.data.toString("base64")}`,
    shipmentId: asset.shipmentId,
    trackingReference: asset.trackingReference,
  };
};

module.exports = {
  bookShipmentForOrder,
  cancelShipmentForOrder,
  applyTrackingStatus,
  applyTrackingUpdate,
  findOrderByShipmentPayload,
  mapShipLogicStatusToOrderStatus,
  buildTrackingUrl,
  getShippingLabelUrlForOrder,
  getShippingLabelAssetForOrder,
  rebookCourierShipmentForOrder,
  resolveShipmentTrackingReference,
  resolveShipmentLabelContext,
  isShipmentMissingError,
};
