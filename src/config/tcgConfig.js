const HttpError = require("../utils/httpError");

const parseJsonEnv = (raw, label) => {
  if (!raw || !String(raw).trim()) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new HttpError(`${label} is not valid JSON: ${err.message}`, 500);
  }
};

const parseBool = (raw, fallback = false) => {
  if (raw == null || raw === "") return fallback;
  const v = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
};

const parseNumber = (raw, fallback) => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

const DEFAULT_COLLECTION_ADDRESS = {
  type: "business",
  company: "Satya",
  street_address: "1 Satya Warehouse Road",
  local_area: "Sandton",
  city: "Johannesburg",
  zone: "GP",
  code: "2196",
  country: "South Africa",
  entered_address: "1 Satya Warehouse Road, Sandton, Johannesburg, 2196, South Africa",
  lat: -26.1076,
  lng: 28.0567,
};

const DEFAULT_COLLECTION_CONTACT = {
  name: "Satya Warehouse",
  email: "warehouse@sathya.co.za",
  mobile_number: "+27821234567",
};

const getTcgConfig = () => {
  const apiEnv = String(process.env.TCG_API_ENV || "test").toLowerCase();
  const useMock = parseBool(process.env.TCG_USE_MOCK, !process.env.TCG_API_KEY);
  const offered = String(process.env.TCG_OFFERED_SERVICE_LEVELS || "OVN,ECO")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  let baseUrl = (process.env.TCG_API_BASE_URL || "").trim().replace(/\/$/, "");
  if (!baseUrl) {
    baseUrl =
      apiEnv === "production"
        ? "https://api-tcg.co.za"
        : "https://api.shiplogic.com";
  }

  return {
    apiEnv,
    useMock,
    apiKey: (process.env.TCG_API_KEY || "").trim(),
    baseUrl,
    offeredServiceLevels: offered.length ? offered : ["OVN", "ECO"],
    quoteTtlMinutes: parseNumber(process.env.TCG_QUOTE_TTL_MINUTES, 45),
    trackingSyncIntervalMs: parseNumber(
      process.env.TCG_TRACKING_SYNC_INTERVAL_MS,
      900000
    ),
    trackingPublicBaseUrl:
      (process.env.TCG_TRACKING_PUBLIC_BASE_URL || "").trim() ||
      "https://www.thecourierguy.co.za/track",
    defaultParcel: {
      submitted_length_cm: parseNumber(process.env.TCG_DEFAULT_PARCEL_LENGTH_CM, 40),
      submitted_width_cm: parseNumber(process.env.TCG_DEFAULT_PARCEL_WIDTH_CM, 30),
      submitted_height_cm: parseNumber(process.env.TCG_DEFAULT_PARCEL_HEIGHT_CM, 8),
      submitted_weight_kg: parseNumber(process.env.TCG_DEFAULT_PARCEL_WEIGHT_KG, 2),
      parcel_description: "Puja kit",
    },
    collectionAddress:
      parseJsonEnv(
        process.env.TCG_COLLECTION_ADDRESS_JSON,
        "TCG_COLLECTION_ADDRESS_JSON"
      ) || (useMock ? DEFAULT_COLLECTION_ADDRESS : null),
    collectionContact:
      parseJsonEnv(
        process.env.TCG_COLLECTION_CONTACT_JSON,
        "TCG_COLLECTION_CONTACT_JSON"
      ) || (useMock ? DEFAULT_COLLECTION_CONTACT : null),
    pickupHours:
      (process.env.TCG_PICKUP_HOURS || "").trim() ||
      "Mon–Fri 09:00–17:00, Sat 09:00–13:00",
    pickupInstructions:
      (process.env.TCG_PICKUP_INSTRUCTIONS || "").trim() ||
      "Please bring your order number, collection code, and a valid ID when collecting.",
    /** ShipLogic POD method, e.g. pin-with-fallback. Set empty or "none" to disable. */
    podMethod: (process.env.TCG_POD_METHOD || "pin-with-fallback").trim(),
  };
};

const requireCollectionConfig = (cfg = getTcgConfig()) => {
  if (!cfg.collectionAddress) {
    throw new HttpError(
      "Warehouse collection address is not configured (TCG_COLLECTION_ADDRESS_JSON)",
      503
    );
  }
  if (!cfg.collectionContact) {
    throw new HttpError(
      "Warehouse collection contact is not configured (TCG_COLLECTION_CONTACT_JSON)",
      503
    );
  }
  return cfg;
};

module.exports = {
  getTcgConfig,
  requireCollectionConfig,
};
