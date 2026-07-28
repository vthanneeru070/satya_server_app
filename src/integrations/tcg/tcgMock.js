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
  podMethod = "",
} = {}) => {
  const short = `M${Date.now().toString(36).slice(-6).toUpperCase()}`;
  const waybill = `MOCK${short}`;
  const podEnabled =
    podMethod && String(podMethod).trim().toLowerCase() !== "none";
  const shipmentId = Math.floor(Math.random() * 900000) + 100000;
  return {
    id: shipmentId,
    custom_tracking_reference: waybill,
    short_tracking_reference: short,
    status: "submitted",
    service_level_code: serviceLevelCode,
    service_level_name: serviceLevelCode === "OVN" ? "Overnight" : "Economy",
    customer_reference: customerReference,
    rate: serviceLevelCode === "OVN" ? 149.5 : 99.5,
    ...(podEnabled
      ? {
          pod_method: podMethod,
          proof_of_delivery_pin: String(Math.floor(100 + Math.random() * 900)),
        }
      : {}),
  };
};

const mockShipmentStore = new Map();

const rememberMockShipment = (shipment) => {
  if (!shipment) return shipment;
  const key = String(
    shipment.custom_tracking_reference ||
      shipment.short_tracking_reference ||
      shipment.id
  );
  mockShipmentStore.set(key, shipment);
  if (shipment.id != null) mockShipmentStore.set(String(shipment.id), shipment);
  return shipment;
};

const advanceMockShipmentStatus = (shipment) => {
  const progression = [
    "submitted",
    "collected",
    "in-transit",
    "out-for-delivery",
    "delivered",
  ];
  const current = String(shipment.status || "submitted").toLowerCase();
  const idx = progression.indexOf(current);
  const next =
    idx >= 0 && idx < progression.length - 1 ? progression[idx + 1] : current;
  shipment.status = next;

  const events = Array.isArray(shipment.tracking_events)
    ? [...shipment.tracking_events]
    : [];
  events.unshift({
    id: Date.now(),
    parcel_id: 0,
    status: next,
    message: `Mock status: ${next}`,
    date: new Date().toISOString(),
  });

  if (next === "delivered" && shipment.pod_method) {
    events.unshift({
      id: Date.now() + 1,
      parcel_id: 0,
      status: "delivered",
      message: "PIN entered successfully",
      date: new Date().toISOString(),
    });
    events.unshift({
      id: Date.now() + 2,
      parcel_id: 0,
      status: "delivered",
      message: "POD image captured",
      date: new Date().toISOString(),
      data: {
        type: "proof-of-delivery-images",
        file_name: [`mock-pod-${shipment.short_tracking_reference}.jpg`],
      },
    });
  }

  shipment.tracking_events = events;
  return shipment;
};

const getMockShipment = ({ id, trackingReference } = {}) => {
  const key = String(trackingReference || id || "");
  let shipment = mockShipmentStore.get(key);
  if (!shipment && id != null) {
    shipment = mockShipmentStore.get(String(id));
  }
  if (!shipment) {
    shipment = rememberMockShipment(
      createMockShipment({
        serviceLevelCode: "ECO",
        customerReference: "MOCK",
        podMethod: "pin-with-fallback",
      })
    );
  }
  return advanceMockShipmentStatus({ ...shipment });
};

const getMockPodEvents = ({ trackingReference, includeDigitalPod = true } = {}) => {
  const shipment = getMockShipment({ trackingReference });
  return {
    tracking_events: (shipment.tracking_events || []).filter((event) =>
      /pod|pin|recipient details/i.test(String(event.message || ""))
    ),
    ...(includeDigitalPod
      ? {
          digital_pod_url: `https://example.com/mock-digital-pod/${shipment.short_tracking_reference}.pdf`,
        }
      : {}),
  };
};

const getMockDigitalPod = ({ trackingReference } = {}) => {
  const shipment = getMockShipment({ trackingReference });
  return {
    url: `https://example.com/mock-digital-pod/${shipment.short_tracking_reference}.pdf`,
  };
};

const getMockPodImages = ({ trackingReference, fileNames = [] } = {}) => {
  const shipment = getMockShipment({ trackingReference });
  const names =
    fileNames.length > 0
      ? fileNames
      : [`mock-pod-${shipment.short_tracking_reference}.jpg`];
  return names.map((name) => ({
    file_name: name,
    url: `https://example.com/mock-pod-images/${encodeURIComponent(name)}`,
  }));
};

module.exports = {
  mockRatesForAddresses,
  createMockShipment,
  rememberMockShipment,
  getMockShipment,
  getMockPodEvents,
  getMockDigitalPod,
  getMockPodImages,
};
