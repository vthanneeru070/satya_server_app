const courierGuyClient = require("./courierGuyClient");
const HttpError = require("../utils/httpError");
const { resolveSaZone } = require("../utils/saAddressZones");
const {
  tcgEnabled,
  collectionAddress,
  defaultParcel,
  offeredServiceLevels,
  tcgApiEnv,
  useMock,
  tcgBaseUrl,
  isTestApi,
} = require("../config/courierGuy");
const { _internal: orderInternals } = require("./orderService");
const { normalizeShippingAddress, assertShippingComplete, buildOrderPayload } =
  orderInternals;

const SERVICE_LEVEL_META = {
  OVN: {
    optionKey: "express",
    label: "Express delivery",
    subtitle: "Approx. 1–2 business days",
    sortOrder: 1,
  },
  ECO: {
    optionKey: "standard",
    label: "Standard delivery",
    subtitle: "Approx. 3–4 business days",
    sortOrder: 2,
  },
};

const buildEnteredAddress = (addr) => {
  const parts = [
    addr.addressLine1,
    addr.city,
    addr.state,
    addr.postalCode,
    addr.country || "South Africa",
  ].filter(Boolean);
  return parts.join(", ");
};

const toTcgAddress = (addr, { company } = {}) => {
  const zone = resolveSaZone(addr.state);
  return {
    type: "residential",
    company: company || addr.fullName || "",
    street_address: addr.addressLine1,
    local_area: addr.city,
    suburb: addr.city,
    city: addr.city,
    code: addr.postalCode,
    zone,
    country: addr.country || "South Africa",
    entered_address: buildEnteredAddress(addr),
  };
};

const buildParcelsFromQuantity = (kitCount) => {
  const qty = Math.max(1, Math.ceil(Number(kitCount) || 1));
  const weight = (defaultParcel.weightKgPerKit * qty).toFixed(2);
  return [
    {
      type: {
        id: defaultParcel.typeId,
        name: defaultParcel.typeName,
      },
      submitted_length_cm: String(defaultParcel.lengthCm),
      submitted_width_cm: String(defaultParcel.widthCm),
      submitted_height_cm: String(defaultParcel.heightCm),
      submitted_weight_kg: weight,
      parcel_description: `Pooja kit x${qty}`,
      alternative_tracking_reference: "",
      is_default: true,
    },
  ];
};

const parseTcgDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const mapRateToOption = (rate) => {
  const sl = rate?.service_level || {};
  const code = String(sl.code || "").toUpperCase();
  const meta = SERVICE_LEVEL_META[code];
  if (!meta) return null;
  if (offeredServiceLevels.length && !offeredServiceLevels.includes(code)) {
    return null;
  }

  const price = Number(rate.rate);
  if (!Number.isFinite(price) || price < 0) return null;

  return {
    optionKey: meta.optionKey,
    serviceLevelCode: code,
    serviceLevelName: sl.name || code,
    label: meta.label,
    subtitle: sl.description || meta.subtitle,
    price,
    currency: "ZAR",
    priceExcludingVat: rate.rate_excluding_vat ?? null,
    estimatedDeliveryFrom: parseTcgDate(sl.delivery_date_from),
    estimatedDeliveryTo: parseTcgDate(sl.delivery_date_to),
    collectionDate: parseTcgDate(sl.collection_date),
    rateRevisionId: rate.rate_revision_id ?? null,
    provider: "THE_COURIER_GUY",
  };
};

/**
 * Fetch delivery options for cart/items + destination address.
 */
const getDeliveryQuotes = async (userId, { shippingAddress, items, useCart = true }) => {
  if (!tcgEnabled) {
    throw new HttpError(
      "Courier delivery is not configured. Set TCG_USE_MOCK=true, or TCG_API_KEY + warehouse address env vars.",
      503
    );
  }

  if (!useMock && !collectionAddress) {
    throw new HttpError("TCG_COLLECTION_ADDRESS_JSON is required for live API quotes", 503);
  }

  const addr = normalizeShippingAddress(shippingAddress);
  assertShippingComplete(addr);

  const { snapshots, totalAmount: subtotalAmount, currency } = await buildOrderPayload(
    userId,
    { items, useCart }
  );

  const kitCount = snapshots.reduce((sum, line) => sum + line.quantity, 0);

  const payload = {
    collection_address: collectionAddress || {
      type: "business",
      company: "Satya Mock Warehouse",
      street_address: "1 Test St",
      city: "Johannesburg",
      code: "2000",
      zone: "GP",
      country: "South Africa",
      entered_address: "1 Test St, Johannesburg, 2000",
    },
    delivery_address: toTcgAddress(addr),
    parcels: buildParcelsFromQuantity(kitCount),
    opt_in_rates: [],
    opt_in_time_based_rates: [],
  };

  const tcgResponse = await courierGuyClient.getRates(payload);
  const rates = Array.isArray(tcgResponse?.rates) ? tcgResponse.rates : [];

  const options = rates
    .map(mapRateToOption)
    .filter(Boolean)
    .sort((a, b) => {
      const ao = SERVICE_LEVEL_META[a.serviceLevelCode]?.sortOrder ?? 99;
      const bo = SERVICE_LEVEL_META[b.serviceLevelCode]?.sortOrder ?? 99;
      return ao - bo;
    });

  if (!options.length) {
    throw new HttpError(
      "No delivery options available for this address. Try a different address or contact support.",
      400
    );
  }

  return {
    provider: "THE_COURIER_GUY",
    apiEnvironment: useMock ? "mock" : tcgApiEnv,
    apiBaseUrl: useMock ? "mock" : tcgBaseUrl,
    isTestApi,
    subtotalAmount,
    currency,
    kitCount,
    options,
    collectionAddressSummary: collectionAddress
      ? { city: collectionAddress.city, company: collectionAddress.company }
      : { city: "Mock", company: "Satya Mock Warehouse" },
  };
};

const findQuoteOption = (quotes, serviceLevelCode) =>
  quotes.options.find(
    (o) => o.serviceLevelCode === String(serviceLevelCode || "").toUpperCase()
  );

module.exports = {
  getDeliveryQuotes,
  findQuoteOption,
  buildParcelsFromQuantity,
  toTcgAddress,
  buildEnteredAddress,
};
