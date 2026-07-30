const HttpError = require("../utils/httpError");
const { getTcgConfig } = require("../config/tcgConfig");
const tcgClient = require("../integrations/tcg/tcgClient");
const ecommerceSettingsService = require("./ecommerceSettingsService");

const SA_TIMEZONE = "Africa/Johannesburg";

const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

/** Calendar date (YYYY-MM-DD) in South Africa — used for TCG min dates. */
const todayIsoDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: SA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

/** ShipLogic expects ISO country code ZA (not "South Africa"). */
const normalizeShipLogicCountry = (countryRaw) => {
  const raw = String(countryRaw || "ZA").trim();
  if (!raw) return "ZA";
  const upper = raw.toUpperCase();
  if (["ZA", "ZAF", "SOUTH AFRICA", "RSA"].includes(upper)) return "ZA";
  return raw;
};

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
  const country = normalizeShipLogicCountry(addr.country);

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

/**
 * Address shape for POST /rates — matches ShipLogic docs
 * (type, company, street_address, local_area, city, zone, country, code[, lat, lng]).
 */
const toRatesAddress = (addr = {}, { type = "residential" } = {}) => {
  const full = toShipLogicAddress(addr, { type });
  const out = {
    type: full.type || type,
    company:
      type === "residential" ? String(addr.company || "") : full.company || "",
    street_address: full.street_address || "",
    local_area: full.local_area || "",
    city: full.city || "",
    zone: full.zone || "",
    country: normalizeShipLogicCountry(full.country),
    code: String(full.code || ""),
  };
  if (Number.isFinite(full.lat) && Number.isFinite(full.lng)) {
    out.lat = full.lat;
    out.lng = full.lng;
  }
  return out;
};

/** Parcel dims only for /rates (no parcel_description). */
const ratesParcels = (cfg = getTcgConfig()) => {
  const p = cfg.defaultParcel || {};
  return [
    {
      submitted_length_cm: Number(p.submitted_length_cm) || 40,
      submitted_width_cm: Number(p.submitted_width_cm) || 30,
      submitted_height_cm: Number(p.submitted_height_cm) || 8,
      submitted_weight_kg: Number(p.submitted_weight_kg) || 2,
    },
  ];
};

const defaultParcels = (cfg = getTcgConfig()) => [{ ...cfg.defaultParcel }];

const collectionAddressFromWarehouse = (warehouse, pickupLocation = {}) => {
  const snap =
    pickupLocation && typeof pickupLocation === "object" ? pickupLocation : {};
  const wh = warehouse && typeof warehouse === "object" ? warehouse : {};
  return toRatesAddress(
    {
      company: snap.company || wh.company || wh.name || "",
      street_address: snap.streetAddress || wh.streetAddress || "",
      local_area: snap.localArea || wh.localArea || wh.city || "",
      city: snap.city || wh.city || "",
      zone: snap.zone || wh.zone || "",
      postalCode: snap.postalCode || wh.postalCode || "",
      country: snap.country || wh.country || "ZA",
      lat: snap.lat != null ? snap.lat : wh.lat,
      lng: snap.lng != null ? snap.lng : wh.lng,
    },
    { type: "business" }
  );
};

/**
 * Resolve quote products from explicit ids/items, product docs, or the user cart.
 * Rejects mixed Ayurvedic + Book/Puja Kit carts via warehouse routing.
 */
const resolveQuoteWarehouse = async ({
  productIds = [],
  items = [],
  products = [],
  userId = null,
} = {}) => {
  const warehouseRoutingService = require("./warehouseRoutingService");
  const Product = require("../models/Product");

  if (Array.isArray(products) && products.length) {
    return warehouseRoutingService.resolveWarehouseForProducts(products);
  }

  let ids = [];
  if (Array.isArray(items) && items.length) {
    ids = items
      .map((it) => String(it.productId || it.product || "").trim())
      .filter(Boolean);
  } else if (Array.isArray(productIds) && productIds.length) {
    ids = productIds.map((id) => String(id || "").trim()).filter(Boolean);
  }

  if (!ids.length && userId) {
    const Cart = require("../models/Cart");
    const cart = await Cart.findOne({
      user: userId,
      isDeleted: { $ne: true },
    }).select("items.product");
    ids = (cart?.items || [])
      .map((it) => String(it.product || "").trim())
      .filter(Boolean);
  }

  ids = [...new Set(ids)];
  if (!ids.length) {
    throw new HttpError(
      "Cart items or productIds are required to quote shipping. Add products to your cart first.",
      400
    );
  }

  const loaded = await Product.find({
    _id: { $in: ids },
    isDeleted: { $ne: true },
  }).select("_id category title");

  if (!loaded.length) {
    throw new HttpError("No valid products found for shipping quote", 404);
  }

  return warehouseRoutingService.resolveWarehouseForProducts(loaded);
};

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
 * Collection address comes from the cart's category warehouse
 * (Ayurvedic → Centurion; book/pujakit → Durban). Mixed carts are rejected.
 */
const quoteDoorToDoor = async ({
  shippingAddress,
  declaredValue = 0,
  productIds = [],
  items = [],
  products = [],
  userId = null,
} = {}) => {
  const cfg = getTcgConfig();
  if (!shippingAddress) {
    throw new HttpError("shippingAddress is required for a delivery quote", 400);
  }

  const deliveryAddress = toRatesAddress(shippingAddress, {
    type: "residential",
  });
  if (
    !deliveryAddress.street_address ||
    !deliveryAddress.city ||
    !deliveryAddress.code
  ) {
    throw new HttpError(
      "Delivery address must include street, city and postal code",
      400
    );
  }

  const resolved = await resolveQuoteWarehouse({
    productIds,
    items,
    products,
    userId,
  });
  const collectionAddress = collectionAddressFromWarehouse(
    resolved.warehouse,
    resolved.pickupLocation
  );
  if (
    !collectionAddress.street_address ||
    !collectionAddress.city ||
    !collectionAddress.code
  ) {
    throw new HttpError(
      `Warehouse ${resolved.warehouseCode} is missing a complete collection address`,
      503
    );
  }

  const saDate = todayIsoDate();
  // ShipLogic POST /rates payload shape (see API docs).
  const payload = {
    collection_address: collectionAddress,
    delivery_address: deliveryAddress,
    parcels: ratesParcels(cfg),
    collection_min_date: saDate,
    delivery_min_date: saDate,
  };
  if (declaredValue > 0) {
    payload.declared_value = roundMoney(declaredValue);
  }

  console.info(
    `[shippingQuote] rates payload warehouse=${resolved.warehouseCode}`,
    JSON.stringify(payload)
  );

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
    warehouse: {
      id: resolved.warehouseId,
      code: resolved.warehouseCode,
      name: resolved.warehouse?.name || "",
    },
    collectionAddress,
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
  products = [],
  productIds = [],
  items = [],
  userId = null,
} = {}) => {
  const code = String(serviceLevelCode || "").trim().toUpperCase();
  if (!code) {
    throw new HttpError("shippingServiceLevelCode is required for delivery", 400);
  }

  const quote = await quoteDoorToDoor({
    shippingAddress,
    declaredValue,
    products,
    productIds,
    items,
    userId,
  });
  const selected = quote.rates.find((r) => r.serviceLevelCode === code);
  if (!selected) {
    throw new HttpError(
      `Service level ${code} is not available for this address. Please request a new quote.`,
      400
    );
  }

  const totals = await resolveDeliveryChargeForQuote({
    subtotal,
    currency,
    selectedRate: selected,
  });
  return {
    ...totals,
    warehouseId: quote.warehouse?.id || null,
    warehouseCode: quote.warehouse?.code || null,
  };
};

const getPickupLocation = async () => {
  const warehouseRoutingService = require("./warehouseRoutingService");
  const { WAREHOUSE_CODE_DURBAN } = require("../constants/warehouses");
  try {
    const warehouse = await warehouseRoutingService.loadWarehouseByCode(
      WAREHOUSE_CODE_DURBAN
    );
    const loc = warehouse.toPickupLocationSnapshot();
    return {
      ...loc,
      lat: warehouse.lat ?? null,
      lng: warehouse.lng ?? null,
    };
  } catch {
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
  }
};

module.exports = {
  toShipLogicAddress,
  toRatesAddress,
  defaultParcels,
  ratesParcels,
  quoteDoorToDoor,
  resolveCheckoutDeliveryTotals,
  resolveDeliveryChargeForQuote,
  getPickupLocation,
  todayIsoDate,
  collectionAddressFromWarehouse,
  SA_TIMEZONE,
};
