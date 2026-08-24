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

const MIXED_WAREHOUSE_CART_MESSAGE =
  "You can't mix Ayurvedic products with Books or Puja Kits in one cart. Remove the other category first or checkout separately.";

const MIXED_WAREHOUSE_CHECKOUT_MESSAGE =
  "Your cart contains items from different pickup locations. Please checkout Books/Puja Kits and Ayurvedic products separately.";

/** Throws 409 when products span Ayurvedic vs Book/Puja Kit warehouses. */
const assertSingleWarehouseForProducts = (products, { context = "checkout" } = {}) => {
  if (!products?.length) return;
  const codes = new Set(products.map((p) => warehouseCodeForCategory(p.category)));
  if (codes.size > 1) {
    throw new HttpError(
      context === "cart" ? MIXED_WAREHOUSE_CART_MESSAGE : MIXED_WAREHOUSE_CHECKOUT_MESSAGE,
      409
    );
  }
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

  assertSingleWarehouseForProducts(products, { context: "checkout" });

  const [code] = [...new Set(products.map((p) => warehouseCodeForCategory(p.category)))];
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

const productIdFromLine = (line) => {
  if (!line) return "";
  if (line.product && typeof line.product === "object" && line.product._id) {
    return String(line.product._id);
  }
  return String(line.product || line.productId || "").trim();
};

/**
 * Resolve return destination warehouse from returned product categories.
 * Ayurvedic → Vishal Ayurveda (Centurion); book/pujakit → Sathya Durban.
 * Prefers `affectedItems` when present; otherwise uses full order lines.
 * Falls back to `order.warehouse` when products cannot be resolved.
 */
const resolveWarehouseForReturn = async ({
  order,
  affectedItems = [],
} = {}) => {
  const lines =
    Array.isArray(affectedItems) && affectedItems.length > 0
      ? affectedItems
      : order?.items || [];
  const productIds = [
    ...new Set(lines.map(productIdFromLine).filter(Boolean)),
  ];

  if (productIds.length) {
    const products = await Product.find({
      _id: { $in: productIds },
      isDeleted: { $ne: true },
    }).select("_id category title");

    if (products.length) {
      const codes = new Set(
        products.map((p) => warehouseCodeForCategory(p.category))
      );
      if (codes.size > 1) {
        throw new HttpError(
          "This return includes Ayurvedic and Book/Puja Kit items that ship to different warehouses. Please create separate return requests per warehouse.",
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
        source: "category",
      };
    }
  }

  if (order?.warehouse) {
    const warehouse = await Warehouse.findOne({
      _id: order.warehouse,
      isActive: true,
      isDeleted: { $ne: true },
    });
    if (warehouse) {
      return {
        warehouse,
        warehouseId: warehouse._id,
        pickupLocation:
          order.pickupLocation || warehouse.toPickupLocationSnapshot(),
        warehouseCode: warehouse.code,
        source: "order",
      };
    }
  }

  throw new HttpError(
    "Could not resolve return warehouse from product category. Ensure warehouses are seeded.",
    503
  );
};

/** ShipLogic contact fields from a warehouse document. */
const warehouseContact = (warehouse, fallback = {}) => ({
  name:
    warehouse?.contactName ||
    warehouse?.name ||
    fallback.name ||
    "Warehouse",
  mobile_number:
    warehouse?.contactPhone || fallback.mobile_number || fallback.phone || "",
  email: warehouse?.contactEmail || fallback.email || "",
});

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
  assertSingleWarehouseForProducts,
  MIXED_WAREHOUSE_CART_MESSAGE,
  resolveWarehouseForProducts,
  resolveWarehouseForProductIds,
  resolveWarehouseForReturn,
  warehouseContact,
  buildAvailabilityForProducts,
  loadWarehouseByCode,
};
