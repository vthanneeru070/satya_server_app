/**
 * Local / CI mock for TCG when TCG_USE_MOCK=true.
 * Returns stable express + standard options without calling external APIs.
 */

const addBusinessDays = (from, days) => {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added += 1;
  }
  return d;
};

/** After this many ms from mock shipment creation, tracking reports "delivered". */
const MOCK_DELIVERED_AFTER_MS =
  Number(process.env.TCG_MOCK_DELIVERED_AFTER_MS) || 120_000;

const mockShipmentCreatedAt = new Map();

const getMockRates = ({ kitCount = 1 } = {}) => {
  const now = new Date();
  const qty = Math.max(1, Number(kitCount) || 1);
  const baseExpress = 89.5;
  const baseStandard = 59.0;
  const perKit = 12.5;

  return {
    rates: [
      {
        rate: String((baseExpress + perKit * (qty - 1)).toFixed(2)),
        rate_excluding_vat: baseExpress,
        service_level: {
          code: "OVN",
          name: "Overnight",
          description: "Mock express — approx. 1–2 business days.",
          delivery_date_from: addBusinessDays(now, 1).toISOString(),
          delivery_date_to: addBusinessDays(now, 2).toISOString(),
        },
      },
      {
        rate: String((baseStandard + perKit * (qty - 1)).toFixed(2)),
        rate_excluding_vat: baseStandard,
        service_level: {
          code: "ECO",
          name: "Economy",
          description: "Mock standard — approx. 3–4 business days.",
          delivery_date_from: addBusinessDays(now, 3).toISOString(),
          delivery_date_to: addBusinessDays(now, 4).toISOString(),
        },
      },
    ],
  };
};

let mockShipmentSeq = 9000;

const createMockShipment = ({ serviceLevelCode = "OVN" } = {}) => {
  mockShipmentSeq += 1;
  const waybill = `TCGD-MOCK-${mockShipmentSeq}`;
  const now = new Date();
  mockShipmentCreatedAt.set(mockShipmentSeq, now);
  return {
    id: mockShipmentSeq,
    custom_tracking_reference: waybill,
    service_level_code: serviceLevelCode,
    status: "submitted",
    estimated_delivery_from: addBusinessDays(now, serviceLevelCode === "OVN" ? 1 : 3).toISOString(),
    estimated_delivery_to: addBusinessDays(now, serviceLevelCode === "OVN" ? 2 : 4).toISOString(),
  };
};

const getMockTracking = (shipmentId, waybill) => {
  const id = Number(shipmentId) || 0;
  const created = mockShipmentCreatedAt.get(id);
  const ageMs = created ? Date.now() - created.getTime() : 0;
  const nowIso = new Date().toISOString();

  if (ageMs >= MOCK_DELIVERED_AFTER_MS) {
    return {
      shipment_id: id,
      custom_tracking_reference: waybill,
      status: "delivered",
      tracking_events: [
        {
          id: 1,
          date: nowIso,
          status: "submitted",
          message: "Shipment created (mock)",
          location: "Johannesburg",
        },
        {
          id: 2,
          date: nowIso,
          status: "in-transit",
          message: "Parcel in transit (mock)",
          location: "Hub",
        },
        {
          id: 3,
          date: nowIso,
          status: "delivered",
          message: "Delivered to recipient (mock)",
          location: "Destination",
        },
      ],
    };
  }

  if (ageMs >= MOCK_DELIVERED_AFTER_MS / 2) {
    return {
      shipment_id: id,
      custom_tracking_reference: waybill,
      status: "in-transit",
      tracking_events: [
        {
          id: 1,
          date: nowIso,
          status: "submitted",
          message: "Shipment created (mock)",
          location: "Johannesburg",
        },
        {
          id: 2,
          date: nowIso,
          status: "in-transit",
          message: "Parcel in transit (mock)",
          location: "Hub",
        },
      ],
    };
  }

  return {
    shipment_id: id,
    custom_tracking_reference: waybill,
    status: "submitted",
    tracking_events: [
      {
        id: 1,
        date: nowIso,
        status: "submitted",
        message: "Shipment created (mock)",
        location: "Johannesburg",
      },
    ],
  };
};

module.exports = {
  getMockRates,
  createMockShipment,
  getMockTracking,
};
