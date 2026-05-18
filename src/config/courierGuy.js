const parseJsonEnv = (key, fallback = null) => {
  const raw = process.env[key];
  if (!raw || !String(raw).trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const nodeEnv = process.env.NODE_ENV || "development";

/** `test` = ShipLogic/TCG sandbox. `production` = live TCG. */
const tcgApiEnv = (
  process.env.TCG_API_ENV || (nodeEnv === "production" ? "production" : "test")
).toLowerCase();

const TCG_API_BASE_URLS = {
  production: "https://api-tcg.co.za",
  /** ShipLogic sandbox — same `/rates`, `/shipments`, `/tracking` paths as TCG docs */
  test: "https://api-sandbox.shiplogic.com",
};

const useMock = process.env.TCG_USE_MOCK === "true";

const tcgApiKey = process.env.TCG_API_KEY || "";
const tcgBaseUrl = (
  process.env.TCG_API_BASE_URL ||
  TCG_API_BASE_URLS[tcgApiEnv] ||
  TCG_API_BASE_URLS.production
).replace(/\/$/, "");

const collectionAddress =
  parseJsonEnv("TCG_COLLECTION_ADDRESS_JSON") ||
  (process.env.TCG_COLLECTION_STREET
    ? {
        type: process.env.TCG_COLLECTION_TYPE || "business",
        company: process.env.TCG_COLLECTION_COMPANY || "Satya",
        street_address: process.env.TCG_COLLECTION_STREET,
        local_area: process.env.TCG_COLLECTION_LOCAL_AREA || "",
        suburb: process.env.TCG_COLLECTION_SUBURB || "",
        city: process.env.TCG_COLLECTION_CITY || "",
        code: process.env.TCG_COLLECTION_POSTAL_CODE || "",
        zone: process.env.TCG_COLLECTION_ZONE || "GP",
        country: process.env.TCG_COLLECTION_COUNTRY || "South Africa",
        entered_address: process.env.TCG_COLLECTION_ENTERED_ADDRESS || "",
        lat: process.env.TCG_COLLECTION_LAT || undefined,
        lng: process.env.TCG_COLLECTION_LNG || undefined,
      }
    : null);

const collectionContact =
  parseJsonEnv("TCG_COLLECTION_CONTACT_JSON") ||
  (process.env.TCG_COLLECTION_CONTACT_NAME
    ? {
        name: process.env.TCG_COLLECTION_CONTACT_NAME,
        email: process.env.TCG_COLLECTION_CONTACT_EMAIL || "",
        mobile_number: process.env.TCG_COLLECTION_CONTACT_PHONE || "",
      }
    : null);

const hasLiveCredentials =
  Boolean(tcgApiKey) && Boolean(collectionAddress) && Boolean(collectionContact);

module.exports = {
  tcgApiKey,
  tcgBaseUrl,
  tcgApiEnv,
  useMock,
  isTestApi: tcgApiEnv === "test" || useMock,
  tcgEnabled: useMock || hasLiveCredentials,
  hasLiveCredentials,
  collectionAddress,
  collectionContact,
  defaultParcel: {
    lengthCm: Number(process.env.TCG_DEFAULT_PARCEL_LENGTH_CM) || 40,
    widthCm: Number(process.env.TCG_DEFAULT_PARCEL_WIDTH_CM) || 30,
    heightCm: Number(process.env.TCG_DEFAULT_PARCEL_HEIGHT_CM) || 8,
    weightKgPerKit: Number(process.env.TCG_DEFAULT_PARCEL_WEIGHT_KG) || 2,
    typeId: process.env.TCG_PARCEL_TYPE_ID || "Standard-flyer",
    typeName: process.env.TCG_PARCEL_TYPE_NAME || "Standard flyer",
  },
  trackingPublicBaseUrl:
    process.env.TCG_TRACKING_PUBLIC_BASE_URL ||
    "https://www.thecourierguy.co.za/track",
  trackingSyncIntervalMs: Number(process.env.TCG_TRACKING_SYNC_INTERVAL_MS) || 900_000,
  shippingPriceTolerance: Number(process.env.TCG_SHIPPING_PRICE_TOLERANCE) || 1,
  offeredServiceLevels: (process.env.TCG_OFFERED_SERVICE_LEVELS || "OVN,ECO")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
  TCG_API_BASE_URLS,
};
