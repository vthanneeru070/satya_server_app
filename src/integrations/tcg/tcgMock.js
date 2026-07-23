const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

const mockRatesForAddresses = ({ offeredServiceLevels = ["OVN", "ECO"] } = {}) => {
  const catalog = {
    OVN: {
      code: "OVN",
      name: "Overnight",
      description: "Expect delivery between 1 - 2 business days.",
      rate: 149.5,
      rateExcludingVat: 130,
      id: 1,
    },
    ECO: {
      code: "ECO",
      name: "Economy",
      description: "Expect delivery between 3 - 4 business days.",
      rate: 99.5,
      rateExcludingVat: 86.52,
      id: 2,
    },
  };

  return offeredServiceLevels
    .map((code) => catalog[String(code).toUpperCase()])
    .filter(Boolean)
    .map((entry) => ({
      rate: String(roundMoney(entry.rate)),
      rate_excluding_vat: roundMoney(entry.rateExcludingVat),
      charged_weight: 2,
      rate_revision_id: 9001,
      service_level: {
        id: entry.id,
        code: entry.code,
        name: entry.name,
        description: entry.description,
        collection_date: null,
        delivery_date_from: null,
        delivery_date_to: null,
      },
      surcharges: [],
      mandatory_charges: [],
    }));
};

const createMockShipment = ({
  serviceLevelCode = "ECO",
  customerReference = "",
} = {}) => {
  const short = `M${Date.now().toString(36).slice(-6).toUpperCase()}`;
  const waybill = `MOCK${short}`;
  return {
    id: Math.floor(Math.random() * 900000) + 100000,
    custom_tracking_reference: waybill,
    short_tracking_reference: short,
    status: "submitted",
    service_level_code: serviceLevelCode,
    service_level_name: serviceLevelCode === "OVN" ? "Overnight" : "Economy",
    customer_reference: customerReference,
    rate: serviceLevelCode === "OVN" ? 149.5 : 99.5,
  };
};

module.exports = {
  mockRatesForAddresses,
  createMockShipment,
};
