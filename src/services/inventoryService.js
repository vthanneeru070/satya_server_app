const InventoryItem = require("../models/InventoryItem");
const Product = require("../models/Product");
const HttpError = require("../utils/httpError");
const { inventory: inventoryMaster } = require("../masterdata");

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

/** Per-kit usage amount (inventory base units). */
const parseKitLineQuantity = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};

/**
 * How many full kits can be assembled from current inventory rows.
 */
const computeAvailableKits = (kitItems = [], inventoryById = new Map()) => {
  if (!kitItems.length) return 0;
  let minKits = Infinity;
  for (const line of kitItems) {
    const invId = String(line.inventoryItem?._id || line.inventoryItem || "");
    const inv = inventoryById.get(invId);
    const perKit = parseKitLineQuantity(line.quantity);
    if (!inv || !perKit) return 0;
    if (inv.status !== "ACTIVE" || inv.isDeleted) return 0;
    const stock = Number(inv.stockQuantity) || 0;
    minKits = Math.min(minKits, Math.floor(stock / perKit));
  }
  return Number.isFinite(minKits) ? Math.max(0, minKits) : 0;
};

const loadInventoryMap = async (inventoryIds) => {
  const ids = [...new Set(inventoryIds.filter(Boolean).map(String))];
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
      if (line.inventoryItem) ids.push(line.inventoryItem);
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
  const invIds = (plain.items || []).map((l) => l.inventoryItem).filter(Boolean);
  const invMap = await loadInventoryMap(invIds);

  plain.items = (plain.items || []).map((line) => {
    const invId = String(line.inventoryItem?._id || line.inventoryItem || "");
    const inv = invMap.get(invId);
    return {
      ...line,
      inventoryItem: inv
        ? {
            _id: inv._id,
            name: inv.name,
            slug: inv.slug,
            imageUrl: inv.imageUrl,
            category: inv.category,
            unit: inv.unit,
            stockQuantity: inv.stockQuantity,
            status: inv.status,
            lowStockThreshold: inv.lowStockThreshold,
          }
        : line.inventoryItem,
    };
  });

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
      const invId = String(line.inventoryItem?._id || line.inventoryItem || "");
      const inv = invMap.get(invId);
      return {
        ...line,
        inventoryItem: inv
          ? {
              _id: inv._id,
              name: inv.name,
              slug: inv.slug,
              imageUrl: inv.imageUrl,
              category: inv.category,
              unit: inv.unit,
              stockQuantity: inv.stockQuantity,
              status: inv.status,
              lowStockThreshold: inv.lowStockThreshold,
            }
          : line.inventoryItem,
      };
    });
    const availableKits = computeAvailableKits(plain.items, invMap);
    plain.stockQuantity = availableKits;
    plain.inStock = availableKits > 0;
    return plain;
  });
};

const assertKitStockForOrder = (product, orderQty, inventoryById) => {
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
      const invId = String(kitLine.inventoryItem?._id || kitLine.inventoryItem || "");
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

const buildInventoryRestockOps = (orderLines, productMap) => {
  const incrementByInv = new Map();
  for (const line of orderLines) {
    const product = productMap.get(String(line.product));
    if (!product?.items?.length) continue;
    for (const kitLine of product.items) {
      const invId = String(kitLine.inventoryItem?._id || kitLine.inventoryItem || "");
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
  const ops = buildInventoryDeductionOps(order.items, productMap);
  if (!ops.length) {
    throw new HttpError("Product kit has no inventory components configured", 500);
  }
  const result = await InventoryItem.bulkWrite(ops, { session });
  if (result.modifiedCount !== ops.length) {
    throw new HttpError(
      "One or more inventory items went out of stock during checkout. Please review your cart.",
      409
    );
  }
};

const restockInventoryForOrder = async (order, productMap, session) => {
  const ops = buildInventoryRestockOps(order.items, productMap);
  if (ops.length) await InventoryItem.bulkWrite(ops, { session });
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

  const stockQuantity = Math.max(0, Math.floor(Number(body.stockQuantity) || 0));
  const lowStockThreshold = Math.max(
    0,
    Math.floor(Number(body.lowStockThreshold ?? 10) || 10)
  );

  const slug = await generateUniqueSlug(body.slug || name);
  const doc = await InventoryItem.create({
    name,
    slug,
    description: String(body.description || "").trim(),
    imageUrl: imageUrl || null,
    category,
    unit,
    stockQuantity,
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
  computeAvailableKits,
  parseKitLineQuantity,
  _internal: { generateUniqueSlug, buildInventoryDeductionOps },
};
