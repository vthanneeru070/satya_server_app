const InventoryItem = require("../models/InventoryItem");
const Product = require("../models/Product");
const HttpError = require("../utils/httpError");
const { inventory: inventoryMaster } = require("../masterdata");
const { usesProductQuantity } = require("../validations/productValidation");

const notDeleted = { isDeleted: { $ne: true } };

const slugify = (input) =>
  String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const generateUniqueSlug = async (rawValue, ignoreId = null) => {
  const base = slugify(rawValue);
  if (!base) throw new HttpError("name is required to generate a slug", 400);
  let candidate = base;
  let suffix = 2;
  for (let i = 0; i < 50; i += 1) {
    const filter = { slug: candidate, ...notDeleted };
    if (ignoreId) filter._id = { $ne: ignoreId };
    const exists = await InventoryItem.findOne(filter).select("_id").lean();
    if (!exists) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  throw new HttpError("Could not generate a unique slug", 500);
};

const parsePositiveNumber = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};

/** Product kit line: stock units consumed per kit sold (must be a positive number). */
const parseKitLineQuantity = (value) => parsePositiveNumber(value);

const parseItemQuantity = (value) => parsePositiveNumber(value);

const normalizeNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const resolvePricing = ({ price, salePrice, currency }) => {
  const resolvedPrice = normalizeNumber(price);
  if (resolvedPrice === undefined) {
    throw new HttpError("price is required", 400);
  }
  if (resolvedPrice < 0) throw new HttpError("price must be >= 0", 400);

  let resolvedSale = null;
  if (salePrice !== undefined && salePrice !== null && salePrice !== "") {
    const sp = normalizeNumber(salePrice);
    if (sp !== undefined) resolvedSale = sp;
  }
  if (resolvedSale !== null && resolvedSale > resolvedPrice) {
    throw new HttpError("salePrice must be less than or equal to price", 400);
  }

  const resolvedCurrency = String(currency || "ZAR")
    .trim()
    .toUpperCase();
  if (!resolvedCurrency) throw new HttpError("currency is required", 400);

  return { price: resolvedPrice, salePrice: resolvedSale, currency: resolvedCurrency };
};

const applyPricingUpdates = (item, body) => {
  const mergedPrice = body.price !== undefined ? normalizeNumber(body.price) : item.price;
  const mergedSale =
    body.salePrice !== undefined
      ? body.salePrice === null || body.salePrice === ""
        ? null
        : normalizeNumber(body.salePrice)
      : item.salePrice;
  const mergedCurrency =
    body.currency !== undefined
      ? String(body.currency).trim().toUpperCase()
      : item.currency;

  if (mergedPrice !== undefined && mergedPrice < 0) {
    throw new HttpError("price must be >= 0", 400);
  }
  if (
    mergedSale !== null &&
    mergedSale !== undefined &&
    mergedPrice !== undefined &&
    mergedSale > mergedPrice
  ) {
    throw new HttpError("salePrice must be less than or equal to price", 400);
  }

  if (body.price !== undefined && mergedPrice !== undefined) item.price = mergedPrice;
  if (body.salePrice !== undefined) item.salePrice = mergedSale;
  if (body.currency !== undefined) item.currency = mergedCurrency;
};

/** ObjectId, hex string, or populated subdoc → 24-char hex id (or null). */
const resolveInventoryItemId = (ref) => {
  if (ref == null || ref === "") return null;
  if (typeof ref === "string") {
    const trimmed = ref.trim();
    return /^[a-f0-9]{24}$/i.test(trimmed) ? trimmed : null;
  }
  if (typeof ref === "object") {
    const raw = ref._id ?? ref.id;
    if (raw != null) {
      const s = String(raw).trim();
      return /^[a-f0-9]{24}$/i.test(s) ? s : null;
    }
  }
  return null;
};

const formatInventorySummary = (inv) => {
  if (!inv) return inv;
  const stockQuantity = Number(inv.stockQuantity) || 0;
  const itemQuantity = Number(inv.itemQuantity) || 0;
  const totalAvailableQuantity = Math.round(stockQuantity * itemQuantity * 1000) / 1000;
  const price = Number(inv.price) || 0;
  const salePrice =
    inv.salePrice !== null && inv.salePrice !== undefined ? Number(inv.salePrice) : null;
  const effectivePrice = salePrice && salePrice > 0 ? salePrice : price;
  return {
    ...inv,
    stockQuantity,
    itemQuantity,
    unit: inv.unit,
    totalAvailableQuantity,
    price,
    salePrice,
    currency: inv.currency,
    effectivePrice,
  };
};

/**
 * How many full kits can be assembled from current inventory rows.
 * Kit line `quantity` = stock units needed per kit (e.g. 2 packs of 50g turmeric).
 */
const computeAvailableKits = (kitItems = [], inventoryById = new Map()) => {
  if (!kitItems.length) return 0;
  let minKits = Infinity;
  for (const line of kitItems) {
    const invId = resolveInventoryItemId(line.inventoryItem) || "";
    const inv = inventoryById.get(invId);
    const unitsPerKit = parseKitLineQuantity(line.quantity);
    if (!inv || !unitsPerKit) return 0;
    if (inv.status !== "ACTIVE" || inv.isDeleted) return 0;
    const stockUnits = Number(inv.stockQuantity) || 0;
    minKits = Math.min(minKits, Math.floor(stockUnits / unitsPerKit));
  }
  return Number.isFinite(minKits) ? Math.max(0, minKits) : 0;
};

const loadInventoryMap = async (inventoryIds) => {
  const ids = [
    ...new Set(inventoryIds.map(resolveInventoryItemId).filter(Boolean)),
  ];
  if (!ids.length) return new Map();
  const rows = await InventoryItem.find({
    _id: { $in: ids },
    ...notDeleted,
  }).lean();
  return new Map(rows.map((r) => [String(r._id), r]));
};

const collectInventoryIdsFromProducts = (products) => {
  const ids = [];
  for (const p of products) {
    for (const line of p.items || []) {
      const id = resolveInventoryItemId(line.inventoryItem);
      if (id) ids.push(id);
    }
  }
  return ids;
};

/**
 * Attach populated inventory lines + computed `stockQuantity` / `inStock` on product doc.
 */
const enrichProductStock = async (product) => {
  if (!product) return product;
  const plain = product.toObject ? product.toObject({ virtuals: true }) : { ...product };
  const invIds = (plain.items || [])
    .map((l) => resolveInventoryItemId(l.inventoryItem))
    .filter(Boolean);
  const invMap = await loadInventoryMap(invIds);

  plain.items = (plain.items || []).map((line) => {
    const invId = resolveInventoryItemId(line.inventoryItem) || "";
    const inv = invMap.get(invId);
    return {
      ...line,
      inventoryItem: inv ? formatInventorySummary(inv) : line.inventoryItem,
    };
  });

  if (usesProductQuantity(plain.category)) {
    const stock = Number(plain.quantity) || 0;
    plain.stockQuantity = stock;
    plain.inStock = stock > 0;
    return plain;
  }

  const availableKits = computeAvailableKits(plain.items, invMap);
  plain.stockQuantity = availableKits;
  plain.inStock = availableKits > 0;
  return plain;
};

const enrichProductsStock = async (products) => {
  const list = products.map((p) => (p.toObject ? p.toObject({ virtuals: true }) : { ...p }));
  const invMap = await loadInventoryMap(collectInventoryIdsFromProducts(list));
  return list.map((plain) => {
    plain.items = (plain.items || []).map((line) => {
      const invId = resolveInventoryItemId(line.inventoryItem) || "";
      const inv = invMap.get(invId);
      return {
        ...line,
        inventoryItem: inv ? formatInventorySummary(inv) : line.inventoryItem,
      };
    });
    if (usesProductQuantity(plain.category)) {
      const stock = Number(plain.quantity) || 0;
      plain.stockQuantity = stock;
      plain.inStock = stock > 0;
      return plain;
    }

    const availableKits = computeAvailableKits(plain.items, invMap);
    plain.stockQuantity = availableKits;
    plain.inStock = availableKits > 0;
    return plain;
  });
};

const assertKitStockForOrder = (product, orderQty, inventoryById) => {
  if (usesProductQuantity(product.category)) {
    const available = Number(product.quantity) || 0;
    if (available <= 0) {
      throw new HttpError(`"${product.title}" is out of stock`, 400);
    }
    if (orderQty > available) {
      throw new HttpError(
        `Only ${available} unit(s) of "${product.title}" are available`,
        400
      );
    }
    return;
  }

  const available = computeAvailableKits(product.items || [], inventoryById);
  if (available <= 0) {
    throw new HttpError(`"${product.title}" is out of stock`, 400);
  }
  if (orderQty > available) {
    throw new HttpError(
      `Only ${available} kit(s) of "${product.title}" can be built from inventory`,
      400
    );
  }
};

/**
 * Build bulkWrite ops to deduct inventory for each order line (kits × components).
 */
const buildInventoryDeductionOps = (orderLines, productMap) => {
  const decrementByInv = new Map();
  for (const line of orderLines) {
    const product = productMap.get(String(line.product));
    if (!product?.items?.length) continue;
    for (const kitLine of product.items) {
      const invId = resolveInventoryItemId(kitLine.inventoryItem);
      const perKit = parseKitLineQuantity(kitLine.quantity);
      if (!invId || !perKit) continue;
      const total = line.quantity * perKit;
      decrementByInv.set(invId, (decrementByInv.get(invId) || 0) + total);
    }
  }
  return [...decrementByInv.entries()].map(([id, dec]) => ({
    updateOne: {
      filter: {
        _id: id,
        stockQuantity: { $gte: dec },
        status: "ACTIVE",
        ...notDeleted,
      },
      update: { $inc: { stockQuantity: -dec } },
    },
  }));
};

const buildAyurvedicQuantityDeductionOps = (orderLines, productMap) =>
  orderLines
    .map((line) => {
      const product = productMap.get(String(line.product));
      if (!usesProductQuantity(product?.category)) return null;
      return {
        updateOne: {
          filter: {
            _id: line.product,
            quantity: { $gte: line.quantity },
            ...notDeleted,
          },
          update: { $inc: { quantity: -line.quantity } },
        },
      };
    })
    .filter(Boolean);

const buildAyurvedicQuantityRestockOps = (orderLines, productMap) =>
  orderLines
    .map((line) => {
      const product = productMap.get(String(line.product));
      if (!usesProductQuantity(product?.category)) return null;
      return {
        updateOne: {
          filter: { _id: line.product, ...notDeleted },
          update: { $inc: { quantity: line.quantity } },
        },
      };
    })
    .filter(Boolean);

const buildInventoryRestockOps = (orderLines, productMap) => {
  const incrementByInv = new Map();
  for (const line of orderLines) {
    const product = productMap.get(String(line.product));
    if (!product?.items?.length) continue;
    for (const kitLine of product.items) {
      const invId = resolveInventoryItemId(kitLine.inventoryItem);
      const perKit = parseKitLineQuantity(kitLine.quantity);
      if (!invId || !perKit) continue;
      const total = line.quantity * perKit;
      incrementByInv.set(invId, (incrementByInv.get(invId) || 0) + total);
    }
  }
  return [...incrementByInv.entries()].map(([id, inc]) => ({
    updateOne: {
      filter: { _id: id, ...notDeleted },
      update: { $inc: { stockQuantity: inc } },
    },
  }));
};

const applyInventoryDeductionForOrder = async (order, productMap, session) => {
  const invOps = buildInventoryDeductionOps(order.items, productMap);
  const productQtyOps = buildAyurvedicQuantityDeductionOps(order.items, productMap);

  if (!invOps.length && !productQtyOps.length) {
    throw new HttpError("Product has no stock configured", 500);
  }

  if (invOps.length) {
    const result = await InventoryItem.bulkWrite(invOps, { session });
    if (result.modifiedCount !== invOps.length) {
      throw new HttpError(
        "One or more inventory items went out of stock during checkout. Please review your cart.",
        409
      );
    }
  }

  if (productQtyOps.length) {
    const result = await Product.bulkWrite(productQtyOps, { session });
    if (result.modifiedCount !== productQtyOps.length) {
      throw new HttpError(
        "One or more products went out of stock during checkout. Please review your cart.",
        409
      );
    }
  }
};

const restockInventoryForOrder = async (order, productMap, session) => {
  const invOps = buildInventoryRestockOps(order.items, productMap);
  const productQtyOps = buildAyurvedicQuantityRestockOps(order.items, productMap);
  if (invOps.length) await InventoryItem.bulkWrite(invOps, { session });
  if (productQtyOps.length) await Product.bulkWrite(productQtyOps, { session });
};

const loadProductsForOrderLines = async (orderLines, session) => {
  const productIds = orderLines.map((l) => l.product);
  let q = Product.find({ _id: { $in: productIds }, ...notDeleted });
  if (session) q = q.session(session);
  const products = await q;
  return new Map(products.map((p) => [String(p._id), p]));
};

// ── CRUD ─────────────────────────────────────────────────────────────────────

const createInventoryItem = async ({ body, imageUrl, userId }) => {
  const name = String(body.name || "").trim();
  if (!name) throw new HttpError("name is required", 400);
  const category = await inventoryMaster.categories.assertValid(body.category);
  const unit = String(body.unit || "").trim();
  if (!unit) throw new HttpError("unit is required", 400);

  const itemQuantity = parseItemQuantity(body.itemQuantity);
  if (!itemQuantity) {
    throw new HttpError("itemQuantity must be a positive number (amount per stock unit)", 400);
  }

  const stockQuantity = Math.max(0, Math.floor(Number(body.stockQuantity) || 0));
  const lowStockThreshold = Math.max(
    0,
    Math.floor(Number(body.lowStockThreshold ?? 10) || 10)
  );

  const pricing = resolvePricing(body);

  const slug = await generateUniqueSlug(body.slug || name);
  const doc = await InventoryItem.create({
    name,
    slug,
    description: String(body.description || "").trim(),
    imageUrl: imageUrl || null,
    category,
    unit,
    itemQuantity,
    stockQuantity,
    price: pricing.price,
    salePrice: pricing.salePrice,
    currency: pricing.currency,
    supplierName: String(body.supplierName || "").trim(),
    lowStockThreshold,
    status: body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    createdBy: userId,
  });
  return doc;
};

const updateInventoryItem = async ({ id, body, imageUrl }) => {
  const item = await InventoryItem.findOne({ _id: id, ...notDeleted });
  if (!item) throw new HttpError("Inventory item not found", 404);

  if (body.name !== undefined) item.name = String(body.name).trim();
  if (body.description !== undefined) item.description = String(body.description).trim();
  if (body.category !== undefined) {
    item.category = await inventoryMaster.categories.assertValid(body.category);
  }
  if (body.unit !== undefined) {
    const u = String(body.unit).trim();
    if (!u) throw new HttpError("unit cannot be empty", 400);
    item.unit = u;
  }
  if (body.supplierName !== undefined) item.supplierName = String(body.supplierName).trim();
  applyPricingUpdates(item, body);
  if (body.itemQuantity !== undefined) {
    const iq = parseItemQuantity(body.itemQuantity);
    if (!iq) throw new HttpError("itemQuantity must be a positive number", 400);
    item.itemQuantity = iq;
  }
  if (body.stockQuantity !== undefined) {
    item.stockQuantity = Math.max(0, Math.floor(Number(body.stockQuantity) || 0));
  }
  if (body.lowStockThreshold !== undefined) {
    item.lowStockThreshold = Math.max(0, Math.floor(Number(body.lowStockThreshold) || 0));
  }
  if (body.status !== undefined) item.status = body.status;

  if (body.slug !== undefined || (body.name && body.name !== item.name)) {
    item.slug = await generateUniqueSlug(body.slug || body.name || item.name, item._id);
  }

  if (imageUrl) item.imageUrl = imageUrl;
  await item.save();
  return item;
};

const deleteInventoryItem = async (id, { hard = false } = {}) => {
  const item = await InventoryItem.findById(id);
  if (!item || item.isDeleted) throw new HttpError("Inventory item not found", 404);
  if (hard) {
    await item.deleteOne();
    return { id, hardDeleted: true };
  }
  item.isDeleted = true;
  item.status = "INACTIVE";
  await item.save();
  return { id, hardDeleted: false };
};

const getInventoryItemById = async (id) => {
  const item = await InventoryItem.findOne({ _id: id, ...notDeleted }).populate(
    "createdBy",
    "fullName email role"
  );
  if (!item) throw new HttpError("Inventory item not found", 404);
  return item;
};

const listInventoryItems = async (query = {}) => {
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const skip = (page - 1) * limit;
  const filter = { ...notDeleted };
  if (query.status) filter.status = query.status;
  if (query.category) filter.category = query.category;
  if (query.search) {
    const safe = String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: safe, $options: "i" } },
      { description: { $regex: safe, $options: "i" } },
    ];
  }
  const lowStock = query.lowStock === true || query.lowStock === "true";
  if (lowStock) {
    filter.$expr = { $lte: ["$stockQuantity", "$lowStockThreshold"] };
  }

  const [items, total] = await Promise.all([
    InventoryItem.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "fullName email role"),
    InventoryItem.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
};

const adjustStock = async (id, { delta, reason = "" } = {}) => {
  const change = Number(delta);
  if (!Number.isFinite(change) || change === 0) {
    throw new HttpError("delta must be a non-zero number", 400);
  }
  const item = await InventoryItem.findOne({ _id: id, ...notDeleted });
  if (!item) throw new HttpError("Inventory item not found", 404);
  const next = (item.stockQuantity || 0) + change;
  if (next < 0) {
    throw new HttpError(`Cannot reduce stock below 0 (current: ${item.stockQuantity})`, 400);
  }
  item.stockQuantity = next;
  await item.save();
  return { item, reason: reason ? String(reason).slice(0, 500) : "" };
};

module.exports = {
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getInventoryItemById,
  listInventoryItems,
  adjustStock,
  enrichProductStock,
  enrichProductsStock,
  assertKitStockForOrder,
  applyInventoryDeductionForOrder,
  restockInventoryForOrder,
  loadProductsForOrderLines,
  loadInventoryMap,
  resolveInventoryItemId,
  computeAvailableKits,
  parseKitLineQuantity,
  _internal: { generateUniqueSlug, buildInventoryDeductionOps },
};
