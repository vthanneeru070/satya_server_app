const HttpError = require("../utils/httpError");
const { getTcgConfig, requireCollectionConfig } = require("../config/tcgConfig");
const tcgClient = require("../integrations/tcg/tcgClient");
const ecommerceSettingsService = require("./ecommerceSettingsService");

const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const toShipLogicAddress = (addr = {}, { type = "residential" } = {}) => {
  const street =
    addr.street_address ||
    addr.addressLine1 ||
    addr.line1 ||
    "";
  const code = addr.code || addr.postalCode || addr.pincode || "";
  const city = addr.city || "";
  const zone = addr.zone || addr.state || "";
  const localArea = addr.local_area || addr.suburb || addr.localArea || zone || city;
  const company = addr.company || addr.fullName || "";
  const countryRaw = addr.country || "South Africa";
  const country =
    ["ZA", "ZAF", "SOUTH AFRICA"].includes(String(countryRaw).toUpperCase())
      ? countryRaw.length <= 3
        ? "ZA"
        : "South Africa"
      : countryRaw;

  const out = {
    type: addr.type || type,
    company,
    street_address: street,
    local_area: localArea,
    city,
    zone,
    country,
    code: String(code),
    entered_address:
      addr.entered_address ||
      addr.enteredAddress ||
      [street, localArea, city, code, country].filter(Boolean).join(", "),
  };

  const lat = addr.lat != null ? Number(addr.lat) : NaN;
  const lng = addr.lng != null ? Number(addr.lng) : NaN;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    out.lat = lat;
    out.lng = lng;
  }
  return out;
};

const defaultParcels = (cfg = getTcgConfig()) => [{ ...cfg.defaultParcel }];

const normalizeRate = (raw) => {
  const sl = raw.service_level || {};
  const rate = roundMoney(Number(raw.rate));
  const rateExcludingVat = roundMoney(
    Number(raw.rate_excluding_vat != null ? raw.rate_excluding_vat : rate)
  );
  return {
    provider: "TCG",
    serviceLevelCode: String(sl.code || "").toUpperCase(),
    serviceLevelName: sl.name || String(sl.code || ""),
    description: sl.description || "",
    rate,
    rateExcludingVat,
    rateRevisionId: raw.rate_revision_id ?? null,
    serviceLevelId: sl.id ?? null,
    chargedWeight: raw.charged_weight ?? null,
    collectionDate: sl.collection_date || null,
    deliveryDateFrom: sl.delivery_date_from || null,
    deliveryDateTo: sl.delivery_date_to || null,
  };
};

/**
 * Live (or mock) Door-to-Door rates for a customer delivery address.
 */
const quoteDoorToDoor = async ({ shippingAddress, declaredValue = 0 } = {}) => {
  const cfg = requireCollectionConfig();
  if (!shippingAddress) {
    throw new HttpError("shippingAddress is required for a delivery quote", 400);
  }

  const deliveryAddress = toShipLogicAddress(shippingAddress, { type: "residential" });
  if (!deliveryAddress.street_address || !deliveryAddress.city || !deliveryAddress.code) {
    throw new HttpError(
      "Delivery address must include street, city and postal code",
      400
    );
  }

  const payload = {
    collection_address: cfg.collectionAddress,
    delivery_address: deliveryAddress,
    parcels: defaultParcels(cfg),
    opt_in_rates: [],
    opt_in_time_based_rates: [],
    collection_min_date: todayIsoDate(),
    delivery_min_date: todayIsoDate(),
  };
  if (declaredValue > 0) {
    payload.declared_value = roundMoney(declaredValue);
  }

  const response = await tcgClient.getRates(payload);
  const rates = Array.isArray(response?.rates) ? response.rates : [];
  const allowed = new Set(cfg.offeredServiceLevels.map((c) => c.toUpperCase()));
  const normalized = rates
    .map(normalizeRate)
    .filter((r) => r.serviceLevelCode && allowed.has(r.serviceLevelCode));

  if (!normalized.length) {
    throw new HttpError(
      "No Courier Guy service levels are available for this address",
      422
    );
  }

  const quotedAt = new Date();
  const expiresAt = new Date(
    quotedAt.getTime() + cfg.quoteTtlMinutes * 60 * 1000
  );

  return {
    provider: "TCG",
    quotedAt: quotedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    currency: "ZAR",
    rates: normalized,
  };
};

/**
 * Resolve customer-facing delivery charge from a selected TCG rate + ecommerce free-delivery rules.
 * Returns { deliveryCharge, shippingQuote, totalAmount, subtotal, currency, customerPaysRate }.
 */
const resolveDeliveryChargeForQuote = async ({
  subtotal,
  currency = "ZAR",
  selectedRate,
} = {}) => {
  const settings = await ecommerceSettingsService.getDeliverySettings();
  const normalizedSubtotal = roundMoney(subtotal);
  let deliveryCharge = roundMoney(selectedRate.rate);
  let subsidized = false;

  if (settings.isEnabled === false) {
    deliveryCharge = 0;
    subsidized = true;
  } else if (
    settings.freeDeliveryMinimum != null &&
    normalizedSubtotal >= roundMoney(settings.freeDeliveryMinimum)
  ) {
    deliveryCharge = 0;
    subsidized = true;
  }

  const quotedAt = new Date();
  const cfg = getTcgConfig();
  const expiresAt = new Date(
    quotedAt.getTime() + cfg.quoteTtlMinutes * 60 * 1000
  );

  return {
    subtotal: normalizedSubtotal,
    deliveryCharge,
    totalAmount: roundMoney(normalizedSubtotal + deliveryCharge),
    currency: currency || settings.currency || "ZAR",
    subsidized,
    shippingQuote: {
      provider: "TCG",
      serviceLevelCode: selectedRate.serviceLevelCode,
      serviceLevelName: selectedRate.serviceLevelName,
      description: selectedRate.description || "",
      rate: roundMoney(selectedRate.rate),
      rateExcludingVat: roundMoney(selectedRate.rateExcludingVat),
      rateRevisionId: selectedRate.rateRevisionId ?? null,
      serviceLevelId: selectedRate.serviceLevelId ?? null,
      quotedAt,
      expiresAt,
      customerCharged: deliveryCharge,
      subsidized,
    },
  };
};

/**
 * Re-quote and pick the rate matching serviceLevelCode. Never trusts client rate.
 */
const resolveCheckoutDeliveryTotals = async ({
  shippingAddress,
  serviceLevelCode,
  subtotal,
  currency = "ZAR",
  declaredValue = 0,
} = {}) => {
  const code = String(serviceLevelCode || "").trim().toUpperCase();
  if (!code) {
    throw new HttpError("shippingServiceLevelCode is required for delivery", 400);
  }

  const quote = await quoteDoorToDoor({ shippingAddress, declaredValue });
  const selected = quote.rates.find((r) => r.serviceLevelCode === code);
  if (!selected) {
    throw new HttpError(
      `Service level ${code} is not available for this address. Please request a new quote.`,
      400
    );
  }

  return resolveDeliveryChargeForQuote({
    subtotal,
    currency,
    selectedRate: selected,
  });
};

const getPickupLocation = () => {
  const cfg = getTcgConfig();
  const addr = cfg.collectionAddress || {};
  const contact = cfg.collectionContact || {};
  return {
    company: addr.company || "Satya",
    streetAddress: addr.street_address || "",
    localArea: addr.local_area || "",
    city: addr.city || "",
    zone: addr.zone || "",
    postalCode: addr.code || "",
    country: addr.country || "South Africa",
    enteredAddress: addr.entered_address || "",
    lat: addr.lat ?? null,
    lng: addr.lng ?? null,
    contactName: contact.name || "",
    contactPhone: contact.mobile_number || contact.phone || "",
    contactEmail: contact.email || "",
    hours: cfg.pickupHours,
    instructions: cfg.pickupInstructions,
  };
};

module.exports = {
  toShipLogicAddress,
  defaultParcels,
  quoteDoorToDoor,
  resolveCheckoutDeliveryTotals,
  resolveDeliveryChargeForQuote,
  getPickupLocation,
  todayIsoDate,
};
