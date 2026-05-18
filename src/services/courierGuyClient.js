const axios = require("axios");
const HttpError = require("../utils/httpError");
const {
  tcgApiKey,
  tcgBaseUrl,
  tcgApiEnv,
  useMock,
} = require("../config/courierGuy");
const courierGuyMock = require("./courierGuyMock");

const logPrefix = () => `[tcg:${useMock ? "mock" : tcgApiEnv}]`;

const buildClient = () => {
  if (!tcgApiKey) {
    throw new HttpError("Courier Guy API is not configured (TCG_API_KEY)", 503);
  }
  return axios.create({
    baseURL: tcgBaseUrl,
    timeout: 30_000,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${tcgApiKey}`,
    },
    params: { api_key: tcgApiKey },
  });
};

const tcgRequest = async (method, path, { data, params } = {}) => {
  try {
    const client = buildClient();
    const res = await client.request({ method, url: path, data, params });
    return res.data;
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    const detail =
      body?.message ||
      body?.error ||
      (typeof body === "string" ? body : null) ||
      err.message;
    console.error(
      `${logPrefix()} ${method} ${path} @ ${tcgBaseUrl} failed (${status || "?"}):`,
      detail
    );
    throw new HttpError(
      `Courier Guy API error: ${detail}`,
      status && status >= 400 && status < 600 ? status : 502
    );
  }
};

const getRates = async (payload) => {
  if (useMock) {
    const kitCount =
      payload?.parcels?.[0]?.submitted_weight_kg != null
        ? Math.ceil(Number(payload.parcels[0].submitted_weight_kg) / 2)
        : 1;
    return courierGuyMock.getMockRates({ kitCount });
  }
  return tcgRequest("post", "/rates", { data: payload });
};

const createShipment = async (payload) => {
  if (useMock) {
    return courierGuyMock.createMockShipment({
      serviceLevelCode: payload?.service_level_code,
    });
  }
  return tcgRequest("post", "/shipments", { data: payload });
};

const getTrackingByShipmentId = async (shipmentId, { includeParcels = false } = {}) => {
  if (useMock) {
    return courierGuyMock.getMockTracking(shipmentId, `TCGD-MOCK-${shipmentId}`);
  }
  return tcgRequest("get", "/tracking/shipments", {
    params: { id: shipmentId, include_parcels: includeParcels ? "true" : "false" },
  });
};

const getTrackingByWaybill = async (waybill) => {
  if (useMock) return courierGuyMock.getMockTracking(0, waybill);
  return tcgRequest("get", "/tracking/shipments/public", { params: { waybill } });
};

module.exports = {
  getRates,
  createShipment,
  getTrackingByShipmentId,
  getTrackingByWaybill,
};
