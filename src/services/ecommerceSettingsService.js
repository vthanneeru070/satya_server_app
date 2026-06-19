const EcommerceSettings = require("../models/EcommerceSettings");
const { SINGLETON_KEY } = require("../models/EcommerceSettings");

const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

const formatDeliverySettings = (doc) => ({
  deliveryCharge: roundMoney(doc.deliveryCharge),
  currency: doc.currency || "ZAR",
  isEnabled: doc.isEnabled !== false,
  freeDeliveryMinimum:
    doc.freeDeliveryMinimum == null ? null : roundMoney(doc.freeDeliveryMinimum),
  updatedAt: doc.updatedAt,
  updatedBy: doc.updatedBy || null,
});

const toApiDeliveryCharges = (doc) => ({
  delivery_charge: roundMoney(doc.deliveryCharge),
  currency: doc.currency || "ZAR",
  is_enabled: doc.isEnabled !== false,
  free_delivery_minimum:
    doc.freeDeliveryMinimum == null ? null : roundMoney(doc.freeDeliveryMinimum),
  updated_at: doc.updatedAt,
  updated_by: doc.updatedBy || null,
});

const fromApiDeliveryCharges = (body = {}) => {
  const next = {};
  if (body.delivery_charge !== undefined) {
    next.deliveryCharge = body.delivery_charge;
  }
  if (body.currency !== undefined) {
    next.currency = body.currency;
  }
  if (body.is_enabled !== undefined) {
    next.isEnabled = body.is_enabled;
  }
  if (body.free_delivery_minimum !== undefined) {
    next.freeDeliveryMinimum = body.free_delivery_minimum;
  }
  return next;
};

const getSettingsDoc = async () => {
  let doc = await EcommerceSettings.findOne({ singletonKey: SINGLETON_KEY });
  if (!doc) {
    doc = await EcommerceSettings.create({ singletonKey: SINGLETON_KEY });
  }
  return doc;
};

const getEcommerceSettings = async () => ({
  delivery_charges: toApiDeliveryCharges(await getSettingsDoc()),
});

const getDeliverySettings = async () => {
  const doc = await getSettingsDoc();
  return formatDeliverySettings(doc);
};

const updateDeliverySettings = async (adminUserId, body = {}) => {
  const doc = await getSettingsDoc();

  if (body.deliveryCharge !== undefined) {
    doc.deliveryCharge = roundMoney(body.deliveryCharge);
  }
  if (body.currency !== undefined) {
    doc.currency = String(body.currency).trim().toUpperCase();
  }
  if (body.isEnabled !== undefined) {
    doc.isEnabled = !!body.isEnabled;
  }
  if (body.freeDeliveryMinimum !== undefined) {
    const raw = body.freeDeliveryMinimum;
    doc.freeDeliveryMinimum =
      raw === null || raw === "" ? null : roundMoney(raw);
  }

  doc.updatedBy = adminUserId;
  await doc.save();
  return formatDeliverySettings(doc);
};

const updateEcommerceSettings = async (adminUserId, body = {}) => {
  const deliveryInput =
    body.delivery_charges ||
    body.settings?.delivery_charges ||
    {};

  await updateDeliverySettings(adminUserId, fromApiDeliveryCharges(deliveryInput));
  return getEcommerceSettings();
};

/**
 * Resolve the delivery fee for a cart/order subtotal.
 * Returns 0 when delivery is disabled, cart is empty, or free-delivery threshold is met.
 */
const resolveDeliveryCharge = (settings, subtotal) => {
  const amount = roundMoney(subtotal);
  if (amount <= 0) return 0;
  if (!settings || settings.isEnabled === false) return 0;

  const minimum = settings.freeDeliveryMinimum;
  if (minimum != null && amount >= roundMoney(minimum)) {
    return 0;
  }

  return roundMoney(settings.deliveryCharge);
};

const attachDeliveryTotals = async (subtotal, currency = "ZAR") => {
  const doc = await getSettingsDoc();
  const settings = formatDeliverySettings(doc);
  const normalizedSubtotal = roundMoney(subtotal);
  const deliveryCharge = resolveDeliveryCharge(settings, normalizedSubtotal);

  return {
    subtotal: normalizedSubtotal,
    deliveryCharge,
    totalAmount: roundMoney(normalizedSubtotal + deliveryCharge),
    currency: currency || settings.currency || "ZAR",
    deliverySettings: toApiDeliveryCharges(doc),
  };
};

module.exports = {
  getEcommerceSettings,
  updateEcommerceSettings,
  getDeliverySettings,
  updateDeliverySettings,
  resolveDeliveryCharge,
  attachDeliveryTotals,
  formatDeliverySettings,
  toApiDeliveryCharges,
};
