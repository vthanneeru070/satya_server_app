const Warehouse = require("../models/Warehouse");
const Product = require("../models/Product");
const HttpError = require("../utils/httpError");
const {
  WAREHOUSE_CODE_DURBAN,
  WAREHOUSE_CODE_CENTURION,
} = require("../constants/warehouses");
const {
  isAyurvedicCategory,
  isBookCategory,
} = require("../validations/productValidation");

const normalizeCategory = (category) =>
  String(category || "pujakit").trim().toLowerCase();

/** Map product category to warehouse code. */
const warehouseCodeForCategory = (category) => {
  const cat = normalizeCategory(category);
  if (isAyurvedicCategory(cat)) return WAREHOUSE_CODE_CENTURION;
  if (isBookCategory(cat) || cat === "pujakit") return WAREHOUSE_CODE_DURBAN;
  return WAREHOUSE_CODE_DURBAN;
};

const loadWarehouseByCode = async (code) => {
  const warehouse = await Warehouse.findOne({
    code: String(code || "").trim().toUpperCase(),
    isActive: true,
    isDeleted: { $ne: true },
  });
  if (!warehouse) {
    throw new HttpError(`Warehouse ${code} is not configured`, 503);
  }
  return warehouse;
};

/**
 * Resolve a single warehouse for a set of products.
 * Throws 409 when cart spans multiple warehouses (books/pujakit + ayurvedic).
 */
const resolveWarehouseForProducts = async (products) => {
  if (!products?.length) {
    throw new HttpError("No products to resolve warehouse for", 400);
  }

  const codes = new Set(
    products.map((p) => warehouseCodeForCategory(p.category))
  );

  if (codes.size > 1) {
    throw new HttpError(
      "Your cart contains items from different pickup locations. Please checkout Books/Puja Kits and Ayurvedic products separately.",
      409
    );
  }

  const [code] = [...codes];
  const warehouse = await loadWarehouseByCode(code);
  return {
    warehouse,
    warehouseId: warehouse._id,
    pickupLocation: warehouse.toPickupLocationSnapshot(),
    warehouseCode: warehouse.code,
  };
};

/** Resolve warehouse from product id list (checkout / for-cart API). */
const resolveWarehouseForProductIds = async (productIds) => {
  const ids = [...new Set((productIds || []).map(String).filter(Boolean))];
  if (!ids.length) throw new HttpError("productIds are required", 400);

  const products = await Product.find({
    _id: { $in: ids },
    isDeleted: { $ne: true },
  }).select("_id category title");

  if (products.length !== ids.length) {
    throw new HttpError("One or more products were not found", 404);
  }

  return resolveWarehouseForProducts(products);
};

/** Per-line availability at the resolved warehouse (uses global product/kit stock). */
const buildAvailabilityForProducts = async (products, quantitiesById = {}) => {
  const resolved = await resolveWarehouseForProducts(products);
  const lines = products.map((p) => {
    const requested = Math.max(
      1,
      Math.floor(Number(quantitiesById[String(p._id)] || 1))
    );
    let available = null;
    if (isAyurvedicCategory(p.category) || isBookCategory(p.category)) {
      available = Math.max(0, Math.floor(Number(p.quantity) || 0));
    }
    return {
      productId: p._id,
      title: p.title,
      category: normalizeCategory(p.category),
      requestedQuantity: requested,
      availableAtWarehouse: available,
      inStock: available === null ? true : available >= requested,
    };
  });

  const allInStock = lines.every((l) => l.inStock);
  return {
    ...resolved,
    lines,
    allInStock,
  };
};

module.exports = {
  warehouseCodeForCategory,
  resolveWarehouseForProducts,
  resolveWarehouseForProductIds,
  buildAvailabilityForProducts,
  loadWarehouseByCode,
};
