const tcgClient = require("../integrations/tcg/tcgClient");

const POD_STATUS = {
  PENDING: "pending",
  PIN_VERIFIED: "pin_verified",
  IMAGE_CAPTURED: "image_captured",
  RECIPIENT_DETAILS: "recipient_details",
};

const POD_STATUS_PRIORITY = {
  [POD_STATUS.RECIPIENT_DETAILS]: 1,
  [POD_STATUS.IMAGE_CAPTURED]: 2,
  [POD_STATUS.PIN_VERIFIED]: 3,
};

const POD_MESSAGE_RULES = [
  {
    status: POD_STATUS.PIN_VERIFIED,
    label: "PIN entered successfully",
    pattern: /pin entered successfully/i,
  },
  {
    status: POD_STATUS.IMAGE_CAPTURED,
    label: "POD image captured",
    pattern: /pod image captured/i,
  },
  {
    status: POD_STATUS.RECIPIENT_DETAILS,
    label: "Recipient details entered",
    pattern: /recipient details entered/i,
  },
];

const POD_STATUS_LABELS = {
  [POD_STATUS.PENDING]: "Awaiting proof of delivery",
  [POD_STATUS.PIN_VERIFIED]: "PIN verified",
  [POD_STATUS.IMAGE_CAPTURED]: "POD image captured",
  [POD_STATUS.RECIPIENT_DETAILS]: "Recipient details captured",
};

const classifyPodMessage = (message) => {
  const text = String(message || "").trim();
  if (!text) return null;
  for (const rule of POD_MESSAGE_RULES) {
    if (rule.pattern.test(text)) {
      return { status: rule.status, message: rule.label };
    }
  }
  return null;
};

const eventTimestamp = (event) =>
  event?.date || event?.event_time || event?.time_created || null;

const serializeTrackingEvents = (events = []) => {
  const out = [];
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const status = String(event.status || "").trim().toLowerCase();
    const message = String(event.message || "").trim();
    const rawDate = eventTimestamp(event);
    const date = rawDate ? new Date(rawDate) : null;
    if (!status && !message) continue;
    out.push({
      status,
      message,
      date: date && !Number.isNaN(date.getTime()) ? date : null,
      eventId: event.id != null ? String(event.id) : "",
    });
  }
  return out;
};

const collectImageFileNames = (events = []) => {
  const names = new Set();
  for (const event of events) {
    const data = event?.data;
    if (!data) continue;
    if (data.type === "proof-of-delivery-images") {
      const files = data.file_name ?? data.file_names ?? data.files;
      if (Array.isArray(files)) {
        files.forEach((f) => {
          const name = typeof f === "string" ? f : f?.file_name || f?.name;
          if (name) names.add(String(name));
        });
      } else if (typeof files === "string" && files.trim()) {
        names.add(files.trim());
      }
    }
  }
  return [...names];
};

/**
 * Normalize webhook payloads and shipment documents into tracking event arrays.
 */
const normalizeTrackingEvents = (payload = {}) => {
  if (Array.isArray(payload.tracking_events)) return payload.tracking_events;
  if (Array.isArray(payload.trackingEvents)) return payload.trackingEvents;

  const message = payload.message || payload.tracking_message;
  const hasEventShape =
    message ||
    payload.event_time ||
    payload.date ||
    payload.tracking_event_id ||
    payload.tracking_event;

  if (hasEventShape) {
    return [
      {
        id: payload.id ?? payload.tracking_event_id ?? payload.tracking_event?.id,
        message,
        status: payload.status || payload.shipment_status,
        date: payload.event_time || payload.date,
        data: payload.data,
      },
    ];
  }

  return [];
};

const extractPodSnapshot = (trackingEvents = []) => {
  let best = null;
  let bestPriority = 0;

  for (const event of trackingEvents) {
    const classified = classifyPodMessage(event?.message);
    if (!classified) continue;
    const priority = POD_STATUS_PRIORITY[classified.status] || 0;
    if (priority >= bestPriority) {
      bestPriority = priority;
      best = {
        status: classified.status,
        message: classified.message,
        verifiedAt: eventTimestamp(event),
        eventId: event?.id ?? null,
      };
    }
  }

  return {
    pod: best,
    imageFileNames: collectImageFileNames(trackingEvents),
  };
};

const applyPodFromEvents = (order, trackingEvents = []) => {
  if (!order?.delivery) return { changed: false, podStatus: null };

  const { pod, imageFileNames } = extractPodSnapshot(trackingEvents);
  const prevStatus = order.delivery.pod?.status || "";
  const prevMessage = order.delivery.pod?.message || "";

  if (!pod && !imageFileNames.length) {
    return { changed: false, podStatus: prevStatus || null };
  }

  const existing = order.delivery.pod?.toObject?.() || order.delivery.pod || {};
  const nextPod = {
    ...existing,
    lastSyncedAt: new Date(),
  };

  if (pod) {
    nextPod.status = pod.status;
    nextPod.message = pod.message;
    nextPod.verifiedAt = pod.verifiedAt ? new Date(pod.verifiedAt) : nextPod.verifiedAt;
    nextPod.eventId = pod.eventId != null ? String(pod.eventId) : nextPod.eventId || "";
  }

  if (imageFileNames.length) {
    nextPod.imageFileNames = imageFileNames;
  }

  order.delivery = {
    ...(order.delivery?.toObject?.() || order.delivery || {}),
    pod: nextPod,
  };

  return {
    changed:
      prevStatus !== nextPod.status ||
      prevMessage !== nextPod.message ||
      imageFileNames.length > 0,
    podStatus: nextPod.status || prevStatus || null,
  };
};

const unwrapShipmentDoc = (shipmentResponse) => {
  const list = Array.isArray(shipmentResponse?.shipments)
    ? shipmentResponse.shipments
    : Array.isArray(shipmentResponse)
      ? shipmentResponse
      : shipmentResponse
        ? [shipmentResponse]
        : [];
  return list[0] || shipmentResponse || null;
};

const extractPodAssetUrls = (payload) => {
  const urls = [];
  const pushUrl = (value) => {
    if (typeof value === "string" && value.trim()) urls.push(value.trim());
  };

  if (Array.isArray(payload)) {
    payload.forEach((item) => {
      pushUrl(item?.url);
      pushUrl(item?.signed_url);
      pushUrl(item?.image_url);
    });
    return urls;
  }

  pushUrl(payload?.url);
  pushUrl(payload?.signed_url);
  pushUrl(payload?.digital_pod_url);

  const events = payload?.tracking_events || payload?.events || [];
  for (const event of events) {
    const data = event?.data;
    if (!data) continue;
    if (Array.isArray(data.images)) {
      data.images.forEach((img) => pushUrl(img?.url || img?.signed_url));
    }
    pushUrl(data.url);
    pushUrl(data.signed_url);
  }

  return urls;
};

const enrichPodAssets = async (order) => {
  if (!order?.delivery?.waybill && !order?.delivery?.shipmentId) {
    return { changed: false };
  }

  const podStatus = order.delivery.pod?.status || "";
  const shouldFetch =
    podStatus &&
    podStatus !== POD_STATUS.PENDING &&
    order.delivery.podMethod;

  if (!shouldFetch) return { changed: false };

  const trackingReference =
    order.delivery.waybill || order.delivery.shortTrackingReference || "";
  const shipmentId = order.delivery.shipmentId || undefined;

  let digitalPodUrl = order.delivery.pod?.digitalPodUrl || "";
  let imageUrls = Array.isArray(order.delivery.pod?.imageUrls)
    ? [...order.delivery.pod.imageUrls]
    : [];

  try {
    if (!digitalPodUrl) {
      const digital = await tcgClient.getDigitalPod({
        trackingReference,
        shipmentId,
        trackingEventId: order.delivery.pod?.eventId || undefined,
      });
      digitalPodUrl = extractPodAssetUrls(digital)[0] || digitalPodUrl;
    }
  } catch (err) {
    console.warn(
      `[shippingPod] digital POD fetch failed for ${order.orderNumber}:`,
      err?.message || err
    );
  }

  try {
    if (!imageUrls.length) {
      const podPayload = await tcgClient.getPodEvents({
        trackingReference,
        shipmentId,
        includeDigitalPod: true,
      });
      const fromEvents = extractPodAssetUrls(podPayload);
      if (fromEvents.length) {
        imageUrls = fromEvents;
      }

      const fileNames = order.delivery.pod?.imageFileNames || [];
      if (!imageUrls.length && fileNames.length) {
        const images = await tcgClient.getPodImages({
          trackingReference,
          fileNames,
        });
        imageUrls = extractPodAssetUrls(images);
      }
    }
  } catch (err) {
    console.warn(
      `[shippingPod] POD images fetch failed for ${order.orderNumber}:`,
      err?.message || err
    );
  }

  const prevDigital = order.delivery.pod?.digitalPodUrl || "";
  const prevImages = JSON.stringify(order.delivery.pod?.imageUrls || []);
  const nextImages = JSON.stringify(imageUrls);

  if (digitalPodUrl === prevDigital && nextImages === prevImages) {
    return { changed: false };
  }

  order.delivery = {
    ...(order.delivery?.toObject?.() || order.delivery || {}),
    pod: {
      ...(order.delivery.pod?.toObject?.() || order.delivery.pod || {}),
      digitalPodUrl,
      imageUrls,
      lastSyncedAt: new Date(),
    },
  };

  return { changed: true };
};

/**
 * Pull latest shipment tracking + POD proof from ShipLogic and apply to order.
 */
const syncDeliveryPodForOrder = async (order, { fetchAssets = true } = {}) => {
  if (!order) return { changed: false, nextOrderStatus: null, podStatus: null };
  if (order.fulfillmentMethod === "PICKUP") {
    return { changed: false, nextOrderStatus: null, podStatus: null };
  }
  if (!order.delivery?.shipmentId && !order.delivery?.waybill) {
    return { changed: false, nextOrderStatus: null, podStatus: null };
  }

  const shipment = await tcgClient.getShipment({
    id: order.delivery.shipmentId,
    trackingReference: order.delivery.waybill || undefined,
  });
  const doc = unwrapShipmentDoc(shipment);
  const status = doc?.status;
  const trackingEvents = normalizeTrackingEvents(doc || {});

  const { applyTrackingUpdate } = require("./shippingShipmentService");
  const result = applyTrackingUpdate(order, { status, trackingEvents });

  if (fetchAssets) {
    const assetResult = await enrichPodAssets(order);
    result.changed = result.changed || assetResult.changed;
  }

  return result;
};

module.exports = {
  POD_STATUS,
  POD_STATUS_LABELS,
  classifyPodMessage,
  normalizeTrackingEvents,
  serializeTrackingEvents,
  extractPodSnapshot,
  applyPodFromEvents,
  enrichPodAssets,
  syncDeliveryPodForOrder,
};
