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

const getLabelUrl = (shipmentId) => {
  const cfg = getTcgConfig();
  if (!shipmentId) return "";
  return `${cfg.baseUrl}/shipments/label?id=${encodeURIComponent(shipmentId)}`;
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
  request,
};
