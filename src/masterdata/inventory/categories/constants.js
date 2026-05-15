/**
 * Inventory category codes (stored on InventoryItem.category).
 * Seeded into the InventoryCategory collection via categories.service.
 */
const INVENTORY_CATEGORIES = [
  { code: "SACRED_POWDERS", label: "Sacred Powders", sortOrder: 1 },
  { code: "FLOWERS_AND_LEAVES", label: "Flowers and Leaves", sortOrder: 2 },
  { code: "OILS_AND_GHEE", label: "Oils and Ghee", sortOrder: 3 },
  { code: "LIGHTING_ITEMS", label: "Lighting Items", sortOrder: 4 },
  { code: "INCENSE_AND_FRAGRANCE", label: "Incense and Fragrance", sortOrder: 5 },
  { code: "HOMAM_INGREDIENTS", label: "Homam Ingredients", sortOrder: 6 },
  { code: "GRAINS_AND_FOOD_OFFERINGS", label: "Grains and Food Offerings", sortOrder: 7 },
  { code: "FRUITS_AND_NAIVEDYAM", label: "Fruits and Naivedyam", sortOrder: 8 },
  { code: "COCONUT_AND_BETEL", label: "Coconut and Betel", sortOrder: 9 },
  { code: "KALASH_AND_POOJA_UTENSILS", label: "Kalash and Pooja Utensils", sortOrder: 10 },
  { code: "DECORATION_ITEMS", label: "Decoration Items", sortOrder: 11 },
  { code: "THREADS_AND_CLOTH", label: "Threads and Cloth", sortOrder: 12 },
  { code: "SPIRITUAL_BOOKS", label: "Spiritual Books", sortOrder: 13 },
  { code: "TEMPLE_ACCESSORIES", label: "Temple Accessories", sortOrder: 14 },
  { code: "PACKAGING_MATERIALS", label: "Packaging Materials", sortOrder: 15 },
  { code: "HERBS_AND_MEDICINAL", label: "Herbs and Medicinal", sortOrder: 16 },
  { code: "JEWELRY_AND_ORNAMENTS", label: "Jewelry and Ornaments", sortOrder: 17 },
  { code: "DIYAS_AND_CANDLES", label: "Diyas and Candles", sortOrder: 18 },
  { code: "PANCHAMRUTHAM_ITEMS", label: "Panchamrutham Items", sortOrder: 19 },
  { code: "ABHISHEKAM_ITEMS", label: "Abhishekam Items", sortOrder: 20 },
  { code: "MISCELLANEOUS", label: "Miscellaneous", sortOrder: 21 },
];

const INVENTORY_CATEGORY_CODES = INVENTORY_CATEGORIES.map((c) => c.code);

const isValidInventoryCategory = (code) =>
  INVENTORY_CATEGORY_CODES.includes(String(code || "").trim().toUpperCase());

module.exports = {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_CODES,
  isValidInventoryCategory,
};
