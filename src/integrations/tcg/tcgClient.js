const HttpError = require("../../utils/httpError");
const { getTcgConfig } = require("../../config/tcgConfig");
const { mockRatesForAddresses, createMockShipment } = require("./tcgMock");

const request = async (method, path, { body, query, accept } = {}) => {
  const cfg = getTcgConfig();
  if (cfg.useMock) {
    throw new HttpError("TCG mock mode — use mock helpers instead of HTTP", 500);
  }
  if (!cfg.apiKey) {
    throw new HttpError("TCG_API_KEY is not configured", 503);
  }

  const url = new URL(`${cfg.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
  if (query && typeof query === "object") {
    for (const [k, v] of Object.entries(query)) {
      if (v == null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  const headers = {
    Authorization: `Bearer ${cfg.apiKey}`,
    Accept: accept || "application/json",
  };
  if (body != null) {
    headers["Content-Type"] = "application/json";
  }

  let res;
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(25000),
    });
  } catch (err) {
    console.error("[tcgClient] network error:", err?.message || err);
    throw new HttpError("Courier service is temporarily unavailable", 503);
  }

  const contentType = res.headers.get("content-type") || "";
  let payload = null;
  if (contentType.includes("application/json")) {
    payload = await res.json().catch(() => null);
  } else if (contentType.includes("application/pdf") || contentType.includes("octet-stream")) {
    payload = Buffer.from(await res.arrayBuffer());
  } else {
    const text = await res.text().catch(() => "");
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const msg =
      (payload && (payload.message || payload.error || payload.detail)) ||
      (typeof payload === "string" && payload.slice(0, 300)) ||
      `Courier API error (${res.status})`;
    console.error("[tcgClient]", method, path, res.status, msg);
    throw new HttpError(String(msg), res.status >= 400 && res.status < 600 ? res.status : 502);
  }

  return payload;
};

const getRates = async (payload) => {
  const cfg = getTcgConfig();
  if (cfg.useMock) {
    return { rates: mockRatesForAddresses({ offeredServiceLevels: cfg.offeredServiceLevels }) };
  }
  return request("POST", "/rates", { body: payload });
};

const createShipment = async (payload) => {
  const cfg = getTcgConfig();
  if (cfg.useMock) {
    const { createMockShipment, rememberMockShipment } = require("./tcgMock");
    return rememberMockShipment(
      createMockShipment({
        serviceLevelCode: payload.service_level_code,
        customerReference: payload.customer_reference,
        podMethod: payload.pod_method || cfg.podMethod,
      })
    );
  }
  return request("POST", "/shipments", { body: payload });
};

const cancelShipment = async ({ id, trackingReference } = {}) => {
  const cfg = getTcgConfig();
  if (cfg.useMock) {
    return { ok: true, mocked: true };
  }
  const body = {};
  if (id) body.id = id;
  if (trackingReference) body.tracking_reference = trackingReference;
  return request("POST", "/shipments/cancel", { body });
};

const getShipment = async ({ id, trackingReference } = {}) => {
  const cfg = getTcgConfig();
  if (cfg.useMock) {
    const { getMockShipment } = require("./tcgMock");
    return getMockShipment({ id, trackingReference });
  }
  const query = {};
  if (id) query.id = id;
  if (trackingReference) query.tracking_reference = trackingReference;
  return request("GET", "/shipments", { query });
};

const getPodEvents = async ({
  trackingReference,
  shipmentId,
  includeDigitalPod = true,
} = {}) => {
  const cfg = getTcgConfig();
  if (cfg.useMock) {
    const { getMockPodEvents } = require("./tcgMock");
    return getMockPodEvents({ trackingReference, shipmentId, includeDigitalPod });
  }
  const query = { include_digital_pod: includeDigitalPod ? "true" : "false" };
  if (trackingReference) query.tracking_reference = trackingReference;
  if (shipmentId) query.id = shipmentId;
  return request("GET", "/shipments/pod", { query });
};

const getDigitalPod = async ({
  trackingReference,
  shipmentId,
  trackingEventId,
} = {}) => {
  const cfg = getTcgConfig();
  if (cfg.useMock) {
    const { getMockDigitalPod } = require("./tcgMock");
    return getMockDigitalPod({ trackingReference, shipmentId, trackingEventId });
  }
  const query = {};
  if (trackingReference) query.tracking_reference = trackingReference;
  if (shipmentId) query.id = shipmentId;
  if (trackingEventId) query.tracking_event_id = trackingEventId;
  return request("GET", "/shipments/digital-pod", { query });
};

const getPodImages = async ({ trackingReference, fileNames = [] } = {}) => {
  const cfg = getTcgConfig();
  if (cfg.useMock) {
    const { getMockPodImages } = require("./tcgMock");
    return getMockPodImages({ trackingReference, fileNames });
  }
  return request("POST", "/shipments/pod/images", {
    body: {
      tracking_reference: trackingReference,
      folder: "shipment-images",
      file_name: fileNames,
    },
  });
};

const ensureLabelUrlHasTrackingRef = (url, { id, trackingReference } = {}) => {
  if (!url || !trackingReference) return url || "";
  try {
    const parsed = new URL(String(url));
    if (!parsed.pathname.toLowerCase().includes("/shipments/label")) {
      return String(url);
    }
    if (!parsed.searchParams.get("tracking_reference")) {
      parsed.searchParams.set("tracking_reference", String(trackingReference));
    }
    if (id && !parsed.searchParams.get("id")) {
      parsed.searchParams.set("id", String(id));
    }
    return parsed.toString();
  } catch (_) {
    return String(url);
  }
};

const extractUrlFromLabelPayload = (payload) => {
  if (!payload) return "";
  if (typeof payload === "string" && payload.startsWith("http")) return payload;
  if (Buffer.isBuffer(payload)) return "";

  const candidates = [
    payload.url,
    payload.label_url,
    payload.labelUrl,
    payload.data?.url,
    payload.data?.label_url,
    Array.isArray(payload) ? payload[0]?.data?.url : null,
    Array.isArray(payload) ? payload[0]?.url : null,
  ];
  for (const value of candidates) {
    if (value != null && String(value).trim().startsWith("http")) {
      return String(value).trim();
    }
  }
  return "";
};

const getLabelUrl = ({ id, trackingReference } = {}) => {
  const cfg = getTcgConfig();
  if (!id || !trackingReference) return "";
  const params = new URLSearchParams({
    id: String(id),
    tracking_reference: String(trackingReference),
  });
  return `${cfg.baseUrl}/shipments/label?${params.toString()}`;
};

/** Authenticated label fetch — returns PDF bytes or a signed download URL. */
const fetchLabelAsset = async ({ id, trackingReference } = {}) => {
  const cfg = getTcgConfig();
  if (cfg.useMock) {
    if (!id) throw new HttpError("Shipment id is required for label download", 400);
    return {
      type: "pdf",
      data: Buffer.from("%PDF-1.4\n%Mock shipping label\n"),
      filename: `mock-label-${id}.pdf`,
    };
  }
  if (!id || !trackingReference) {
    throw new HttpError(
      "Shipment id and tracking_reference are required for label download",
      400
    );
  }

  const payload = await request("GET", "/shipments/label", {
    query: {
      id: String(id),
      tracking_reference: String(trackingReference),
    },
    accept: "application/pdf, application/json",
  });

  if (Buffer.isBuffer(payload)) {
    return {
      type: "pdf",
      data: payload,
      filename: `shipping-label-${id}.pdf`,
    };
  }

  const rawUrl = extractUrlFromLabelPayload(payload);
  if (!rawUrl) {
    throw new HttpError("Courier label was not returned by ShipLogic", 502);
  }

  const url = ensureLabelUrlHasTrackingRef(rawUrl, { id, trackingReference });
  return { type: "redirect", url };
};

/** @deprecated Prefer fetchLabelAsset — kept for callers expecting { url }. */
const fetchLabelSignedUrl = async ({ id, trackingReference } = {}) => {
  const asset = await fetchLabelAsset({ id, trackingReference });
  if (asset.type === "redirect") return { url: asset.url };
  return {
    url: `data:application/pdf;base64,${asset.data.toString("base64")}`,
  };
};

module.exports = {
  getRates,
  createShipment,
  cancelShipment,
  getShipment,
  getPodEvents,
  getDigitalPod,
  getPodImages,
  getLabelUrl,
  fetchLabelAsset,
  fetchLabelSignedUrl,
  ensureLabelUrlHasTrackingRef,
  request,
};
