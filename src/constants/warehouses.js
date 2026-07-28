/** Canonical warehouse codes — used in routing and seeds. */
const WAREHOUSE_CODE_DURBAN = "SATHYA_DURBAN";
const WAREHOUSE_CODE_CENTURION = "VISHAL_AYURVEDA";

const WAREHOUSE_SEEDS = [
  {
    code: WAREHOUSE_CODE_DURBAN,
    name: "Satya Warehouse — Pinetown",
    company: "Satya",
    streetAddress: "21 Blue Bell Crescent",
    localArea: "Pinetown",
    city: "Durban",
    zone: "KwaZulu-Natal",
    postalCode: "3610",
    country: "South Africa",
    enteredAddress:
      "21 Blue Bell Crescent, Pinetown, Durban, KwaZulu-Natal, South Africa",
    lat: null,
    lng: null,
    contactName: "Satya Pickup",
    contactPhone: "",
    contactEmail: "",
    hours: "Mon–Fri 09:00–17:00, Sat 09:00–13:00",
    instructions: "Bring your order number and collection PIN to the counter.",
    supportedCategories: ["book", "pujakit"],
    isActive: true,
  },
  {
    code: WAREHOUSE_CODE_CENTURION,
    name: "Vishal Ayurveda — Centurion",
    company: "Vishal Ayurveda",
    streetAddress: "Gary Player Blvd, Blue Valley Golf Estate",
    localArea: "Centurion",
    city: "Centurion",
    zone: "Gauteng",
    postalCode: "0096",
    country: "South Africa",
    enteredAddress:
      "Vishal Ayurveda, Gary Player Blvd, Blue Valley Golf Estate, Centurion, 0096",
    lat: null,
    lng: null,
    contactName: "Vishal Ayurveda",
    contactPhone: "",
    contactEmail: "",
    hours: "Mon–Fri 09:00–17:00",
    instructions: "Ayurvedic product collections at Vishal Ayurveda counter.",
    supportedCategories: ["ayurvedic"],
    isActive: true,
  },
];

module.exports = {
  WAREHOUSE_CODE_DURBAN,
  WAREHOUSE_CODE_CENTURION,
  WAREHOUSE_SEEDS,
};
