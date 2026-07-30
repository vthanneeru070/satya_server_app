const Order = require("../models/Order");
const HttpError = require("../utils/httpError");
const { getTcgConfig, requireCollectionConfig } = require("../config/tcgConfig");
const tcgClient = require("../integrations/tcg/tcgClient");
const {
  toShipLogicAddress,
  defaultParcels,
  todayIsoDate,
} = require("./shippingQuoteService");
const Warehouse = require("../models/Warehouse");
const {
  applyPodFromEvents,
  normalizeTrackingEvents,
  serializeTrackingEvents,
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

const buildTrackingUrl = (trackingRef) => {
  const ref = String(trackingRef || "").trim();
  if (!ref) return "";
  const cfg = getTcgConfig();
  const base = String(cfg.trackingPublicBaseUrl || "").replace(/\/$/, "");
  // Sandbox ShipLogic uses ?ref=… ; live Courier Guy track page uses ?waybill=…
  const isSandboxTrack = /sandbox\.shiplogic\.com/i.test(base);
  const param = isSandboxTrack ? "ref" : "waybill";
  return `${base}?${param}=${encodeURIComponent(ref)}`;
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
  let collectionAddress = cfg.collectionAddress;
  let collectionContact = cfg.collectionContact;

  if (order.warehouse) {
    const Warehouse = require("../models/Warehouse");
    const wh = await Warehouse.findById(order.warehouse).lean();
    if (wh) {
      collectionAddress = warehouseToShipLogicAddress(wh, order.pickupLocation);
      collectionContact = {
        name: wh.contactName || cfg.collectionContact?.name || "Warehouse",
        mobile_number: wh.contactPhone || cfg.collectionContact?.mobile_number || "",
        email: wh.contactEmail || cfg.collectionContact?.email || "",
      };
    }
  }

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
    collection_address: collectionAddress,
    collection_contact: collectionContact,
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
    collectionAddress: snapshotReturnEndpoint(collectionAddress, collectionContact),
    deliveryAddress: snapshotReturnEndpoint(deliveryAddress, {
      name: contactName,
      mobile_number: contactPhone,
      email: "",
    }),
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
    trackingEvents: [
      {
        status,
        message: `Shipment ${status}`,
        date: new Date(),
        eventId: "",
      },
    ],
  };

  order.tracking = {
    ...(order.tracking?.toObject?.() || order.tracking || {}),
    courier: "The Courier Guy",
    trackingNumber: shortRef || waybill,
    trackingUrl: buildTrackingUrl(shortRef || waybill),
  };

  return order;
};

const warehouseToShipLogicAddress = (warehouse, pickupLocation = {}) => {
  const snap =
    pickupLocation && typeof pickupLocation === "object" ? pickupLocation : {};
  const wh = warehouse && typeof warehouse === "object" ? warehouse : {};
  return toShipLogicAddress(
    {
      company: snap.company || wh.company || wh.name || "",
      street_address: snap.streetAddress || wh.streetAddress || "",
      local_area: snap.localArea || wh.localArea || wh.city || "",
      city: snap.city || wh.city || "",
      zone: snap.zone || wh.zone || "",
      postalCode: snap.postalCode || wh.postalCode || "",
      country: snap.country || wh.country || "South Africa",
      enteredAddress: snap.enteredAddress || wh.enteredAddress || "",
      lat: snap.lat != null ? snap.lat : wh.lat,
      lng: snap.lng != null ? snap.lng : wh.lng,
    },
    { type: "business" }
  );
};

/** Human-readable snapshot for CMS / devotee return address cards. */
const snapshotReturnEndpoint = (addr = {}, contact = {}) => {
  const a = addr && typeof addr === "object" ? addr : {};
  const c = contact && typeof contact === "object" ? contact : {};
  const parts = [
    a.company,
    a.street_address || a.streetAddress || a.line1 || a.addressLine1,
    a.local_area || a.localArea || a.suburb,
    a.city,
    a.zone || a.region || a.state,
    a.code || a.postalCode || a.zip,
    a.country,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const entered = String(
    a.entered_address || a.enteredAddress || ""
  ).trim();
  return {
    label: entered || parts.join(", "),
    contactName: String(c.name || c.fullName || a.company || "").trim(),
    contactPhone: String(
      c.mobile_number || c.phone || c.mobile || ""
    ).trim(),
    contactEmail: String(c.email || "").trim(),
  };
};

const snapshotFromOrderShippingAddress = (shippingAddress) => {
  if (!shippingAddress) return snapshotReturnEndpoint({}, {});
  const a = shippingAddress.toObject?.() || shippingAddress;
  return snapshotReturnEndpoint(
    {
      street_address: a.addressLine1 || a.streetAddress || a.line1 || "",
      local_area: a.suburb || a.localArea || "",
      city: a.city || "",
      zone: a.region || a.state || a.province || "",
      postalCode: a.postalCode || a.zip || "",
      country: a.country || "",
      enteredAddress: a.enteredAddress || "",
    },
    {
      name: a.fullName || a.name || "",
      mobile_number: a.phone || a.mobile || "",
      email: a.email || "",
    }
  );
};

/** Backfill TCG collection/delivery address snapshots for older outbound orders. */
const ensureOutboundDeliveryAddressSnapshots = async (order) => {
  if (!order || (order.fulfillmentMethod || "DELIVERY") === "PICKUP") return;

  if (!order.delivery) {
    order.delivery = {};
  }

  const d = order.delivery;
  const hasCollection = Boolean(String(d.collectionAddress?.label || "").trim());
  const hasDelivery = Boolean(String(d.deliveryAddress?.label || "").trim());
  if (hasCollection && hasDelivery) return;

  let dirty = false;

  if (!hasCollection) {
    let warehouse = null;
    if (order.warehouse) {
      const Warehouse = require("../models/Warehouse");
      warehouse = await Warehouse.findById(order.warehouse).lean();
    }
    if (warehouse || order.pickupLocation) {
      const sl = warehouseToShipLogicAddress(warehouse, order.pickupLocation);
      d.collectionAddress = snapshotReturnEndpoint(sl, {
        name:
          warehouse?.contactName ||
          warehouse?.name ||
          order.pickupLocation?.company ||
          "Warehouse",
        mobile_number:
          warehouse?.contactPhone || order.pickupLocation?.contactPhone || "",
        email:
          warehouse?.contactEmail || order.pickupLocation?.contactEmail || "",
      });
      dirty = true;
    } else {
      try {
        const { requireCollectionConfig } = require("../config/tcgConfig");
        const cfg = requireCollectionConfig();
        d.collectionAddress = snapshotReturnEndpoint(
          cfg.collectionAddress,
          cfg.collectionContact
        );
        dirty = true;
      } catch (_) {
        // Config may be incomplete in local/dev; skip quietly.
      }
    }
  }

  if (!hasDelivery && order.shippingAddress) {
    d.deliveryAddress = snapshotFromOrderShippingAddress(order.shippingAddress);
    dirty = true;
  }

  if (dirty) {
    order.markModified?.("delivery");
    try {
      await order.save();
    } catch (err) {
      console.warn(
        `[shippingShipment] could not persist outbound address snapshots for ${order.orderNumber}:`,
        err?.message || err
      );
    }
  }
};

/**
 * Book a return shipment (customer → warehouse) for a delivery refund or replacement.
 * Mutates `requestDoc.returnShipment` but does not save.
 *
 * @param {object} requestDoc — ReplacementRequest or OrderRequest (REFUND)
 * @param {object} originalOrder
 * @param {{ actorUserId?: string, purpose?: 'refund'|'replacement' }} opts
 */
const bookReturnShipmentForRequest = async (
  requestDoc,
  originalOrder,
  { actorUserId, purpose = "replacement" } = {}
) => {
  if (!requestDoc || !originalOrder) {
    throw new HttpError("Return request or original order not found", 404);
  }
  if (originalOrder.fulfillmentMethod !== "DELIVERY") {
    throw new HttpError("Return courier collection applies only to delivery orders", 400);
  }
  if (!originalOrder.shippingAddress) {
    throw new HttpError("Original order has no shipping address", 400);
  }

  const existing = requestDoc.returnShipment || {};
  if (existing.shipmentId) {
    return requestDoc;
  }

  const shortRef = String(originalOrder.delivery?.shortTrackingReference || "").trim();
  const customRef = String(
    originalOrder.delivery?.waybill || originalOrder.tracking?.trackingNumber || ""
  ).trim();
  if (!shortRef && !customRef) {
    throw new HttpError(
      "Original order has no Courier Guy waybill. Mark the return as received manually instead.",
      400
    );
  }

  const cfg = requireCollectionConfig();
  let deliveryAddress = cfg.collectionAddress;
  let deliveryContact = cfg.collectionContact;

  try {
    const warehouseRoutingService = require("./warehouseRoutingService");
    const resolved = await warehouseRoutingService.resolveWarehouseForReturn({
      order: originalOrder,
      affectedItems: requestDoc.affectedItems,
    });
    deliveryAddress = warehouseToShipLogicAddress(
      resolved.warehouse,
      resolved.pickupLocation
    );
    deliveryContact = warehouseRoutingService.warehouseContact(
      resolved.warehouse,
      cfg.collectionContact
    );
  } catch (err) {
    if (originalOrder.warehouse) {
      const wh = await Warehouse.findById(originalOrder.warehouse).lean();
      if (wh) {
        deliveryAddress = warehouseToShipLogicAddress(
          wh,
          originalOrder.pickupLocation
        );
        deliveryContact = {
          name: wh.contactName || cfg.collectionContact?.name || "Warehouse",
          mobile_number:
            wh.contactPhone || cfg.collectionContact?.mobile_number || "",
          email: wh.contactEmail || cfg.collectionContact?.email || "",
        };
      }
    } else {
      console.warn(
        `[shippingShipment] return warehouse resolve failed for ${requestDoc.requestNumber}:`,
        err?.message || err
      );
    }
  }

  const collectionAddress = toShipLogicAddress(originalOrder.shippingAddress, {
    type: "residential",
  });
  const contactPhone = String(originalOrder.shippingAddress.phone || "").trim();
  const contactName = originalOrder.shippingAddress.fullName || "Customer";
  if (!contactPhone) {
    throw new HttpError(
      "Customer phone number is required to book a return collection",
      400
    );
  }

  const serviceLevel =
    originalOrder.shippingQuote?.serviceLevelCode ||
    cfg.offeredServiceLevels?.[0] ||
    "ECO";

  const purposeLabel = purpose === "refund" ? "refund" : "replacement";
  const payload = {
    collection_address: collectionAddress,
    collection_contact: {
      name: contactName,
      mobile_number: contactPhone,
      email: "",
    },
    delivery_address: deliveryAddress,
    delivery_contact: deliveryContact,
    parcels: defaultParcels(cfg),
    opt_in_rates: [],
    opt_in_time_based_rates: [],
    special_instructions_collection: `Return — item for ${purposeLabel}`,
    special_instructions_delivery: `${purposeLabel} return shipment`,
    collection_min_date: `${todayIsoDate()}T00:00:00.000Z`,
    delivery_min_date: `${todayIsoDate()}T00:00:00.000Z`,
    customer_reference_name: "Return for",
    customer_reference: requestDoc.requestNumber || originalOrder.orderNumber,
    service_level_code: serviceLevel,
    mute_notifications: false,
    is_return: true,
    short_tracking_reference: shortRef || customRef,
    ...(customRef ? { custom_tracking_reference: customRef } : {}),
  };

  console.info(
    `[shippingShipment] booking TCG return for ${requestDoc.requestNumber} (original ${originalOrder.orderNumber}, ${purposeLabel})`
  );

  const created = await tcgClient.createShipment(payload);
  const shipmentId = created?.id ?? created?.shipment_id ?? null;
  const waybill =
    created?.custom_tracking_reference ||
    created?.short_tracking_reference ||
    String(shipmentId || "");
  const returnShortRef = created?.short_tracking_reference || "";
  const courierStatus = created?.status || "submitted";
  const trackingReference = waybill || returnShortRef;
  const labelUrl =
    shipmentId && trackingReference
      ? tcgClient.getLabelUrl({ id: shipmentId, trackingReference })
      : "";

  requestDoc.returnShipment = {
    ...(existing.toObject?.() || existing),
    method: "COURIER_COLLECTION",
    status: "RETURN_BOOKED",
    provider: "TCG",
    shipmentId: shipmentId != null ? String(shipmentId) : "",
    waybill,
    shortTrackingReference: returnShortRef,
    trackingUrl: buildTrackingUrl(returnShortRef || waybill),
    labelUrl,
    courierStatus,
    collectionAddress: snapshotReturnEndpoint(collectionAddress, {
      name: contactName,
      mobile_number: contactPhone,
      email: "",
    }),
    deliveryAddress: snapshotReturnEndpoint(deliveryAddress, deliveryContact),
    bookedAt: new Date(),
  };

  return requestDoc;
};

/** @deprecated Use bookReturnShipmentForRequest */
const bookReturnShipmentForReplacement = (replacementRequest, originalOrder, opts) =>
  bookReturnShipmentForRequest(replacementRequest, originalOrder, {
    ...opts,
    purpose: "replacement",
  });

/**
 * Map a ShipLogic courier status onto returnShipment lifecycle.
 * Returns { nextReturnStatus } or nulls when unchanged / unknown.
 */
const mapShipLogicStatusToReturnShipmentStatus = (shipLogicStatus) => {
  const s = String(shipLogicStatus || "").toLowerCase();
  if (!s) return null;
  if (s === "delivered") return "RETURN_RECEIVED";
  if (
    [
      "submitted",
      "collection-assigned",
      "collection-collected",
      "collected",
      "at-hub",
      "in-transit",
      "out-for-delivery",
    ].includes(s) ||
    s.startsWith("collection-") ||
    s.includes("transit")
  ) {
    return "RETURN_IN_TRANSIT";
  }
  return null;
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

  if (events.length) {
    order.delivery = {
      ...(order.delivery?.toObject?.() || order.delivery || {}),
      trackingEvents: serializeTrackingEvents(events),
    };
  }

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
  bookReturnShipmentForRequest,
  bookReturnShipmentForReplacement,
  cancelShipmentForOrder,
  applyTrackingStatus,
  applyTrackingUpdate,
  findOrderByShipmentPayload,
  mapShipLogicStatusToOrderStatus,
  mapShipLogicStatusToReturnShipmentStatus,
  buildTrackingUrl,
  ensureOutboundDeliveryAddressSnapshots,
  snapshotReturnEndpoint,
  snapshotFromOrderShippingAddress,
  warehouseToShipLogicAddress,
  getShippingLabelUrlForOrder,
  getShippingLabelAssetForOrder,
  rebookCourierShipmentForOrder,
  resolveShipmentTrackingReference,
  resolveShipmentLabelContext,
  isShipmentMissingError,
};
