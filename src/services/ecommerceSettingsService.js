const EcommerceSettings = require("../models/EcommerceSettings");
const { SINGLETON_KEY } = require("../models/EcommerceSettings");

const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

const getSettingsDoc = async () => {
  let doc = await EcommerceSettings.findOne({ singletonKey: SINGLETON_KEY });
  if (!doc) {
    doc = await EcommerceSettings.create({ singletonKey: SINGLETON_KEY });
  }
  return doc;
};

const toApiVatSettings = (doc) => ({
  vat_number: (doc.vatNumber || "").trim(),
  vat_percent: roundMoney(doc.vatPercent || 0),
  currency: doc.currency || "ZAR",
  updated_at: doc.updatedAt,
  updated_by: doc.updatedBy || null,
});

const formatVatSettings = (doc) => ({
  vatNumber: (doc.vatNumber || "").trim(),
  vatPercent: roundMoney(doc.vatPercent || 0),
  currency: doc.currency || "ZAR",
  updatedAt: doc.updatedAt,
  updatedBy: doc.updatedBy || null,
});

const getEcommerceSettings = async () => ({
  vat: toApiVatSettings(await getSettingsDoc()),
});

const getVatSettings = async () => formatVatSettings(await getSettingsDoc());

/**
 * VAT on product subtotal only. Courier rates are quoted separately at checkout.
 */
const computeProductVat = (subtotal, settings) => {
  const amount = roundMoney(subtotal);
  const vatPercent = roundMoney(settings?.vatPercent || 0);
  const vatNumber = (settings?.vatNumber || "").trim();
  const taxAmount =
    amount > 0 && vatPercent > 0
      ? roundMoney((amount * vatPercent) / 100)
      : 0;
  return { vatNumber, vatPercent, taxAmount };
};

const applyProductVat = async (subtotal, deliveryCharge = 0, currency = "ZAR") => {
  const settings = await getVatSettings();
  const { vatNumber, vatPercent, taxAmount } = computeProductVat(
    subtotal,
    settings
  );
  const normalizedSubtotal = roundMoney(subtotal);
  const normalizedDelivery = roundMoney(deliveryCharge);
  return {
    subtotal: normalizedSubtotal,
    taxAmount,
    vatPercent,
    vatNumber,
    deliveryCharge: normalizedDelivery,
    totalAmount: roundMoney(normalizedSubtotal + taxAmount + normalizedDelivery),
    currency: currency || settings.currency || "ZAR",
  };
};

const updateEcommerceSettings = async (adminUserId, body = {}) => {
  const input = body.vat || body.settings?.vat || body;
  const doc = await getSettingsDoc();

  if (input.vat_number !== undefined || input.vatNumber !== undefined) {
    doc.vatNumber = String(input.vat_number ?? input.vatNumber ?? "")
      .trim()
      .slice(0, 64);
  }
  if (input.vat_percent !== undefined || input.vatPercent !== undefined) {
    const raw = input.vat_percent ?? input.vatPercent;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      const HttpError = require("../utils/httpError");
      throw new HttpError("vat_percent must be between 0 and 100", 400);
    }
    doc.vatPercent = roundMoney(n);
  }
  if (input.currency !== undefined) {
    doc.currency = String(input.currency).trim().toUpperCase() || "ZAR";
  }

  doc.updatedBy = adminUserId;
  await doc.save();
  return getEcommerceSettings();
};

module.exports = {
  getEcommerceSettings,
  updateEcommerceSettings,
  getVatSettings,
  computeProductVat,
  applyProductVat,
  toApiVatSettings,
  formatVatSettings,
  getSettingsDoc,
};
