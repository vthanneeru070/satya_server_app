const Product = require("../models/Product");
const Pooja = require("../models/Pooja");
const InventoryItem = require("../models/InventoryItem");
const HttpError = require("../utils/httpError");
const { deleteFile } = require("./s3Service");
const inventoryService = require("./inventoryService");
const {
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_PUJA_KIT,
  usesProductQuantity,
  resolveProductQuantityInput,
} = require("../validations/productValidation");

const PRODUCT_CATEGORY_LABELS = {
  ayurvedic: "Ayurvedic",
  pujakit: "Pooja Kit",
  book: "Book",
};

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findMatchingProductCategories = (searchTerm) => {
  const needle = String(searchTerm || "").trim().toLowerCase();
  if (!needle) return [];

  return PRODUCT_CATEGORIES.filter((code) => {
    const label = PRODUCT_CATEGORY_LABELS[code] || code;
    return code.includes(needle) || label.toLowerCase().includes(needle);
  });
};

const buildProductSearchFilter = (searchTerm) => {
  const trimmed = String(searchTerm || "").trim();
  if (!trimmed) return null;

  const safe = escapeRegex(trimmed);
  const orClauses = [
    { title: { $regex: safe, $options: "i" } },
    { category: { $regex: safe, $options: "i" } },
  ];

  const matchingCategories = findMatchingProductCategories(trimmed);
  if (matchingCategories.length) {
    orClauses.push({ category: { $in: matchingCategories } });
  }

  return { $or: orClauses };
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const slugify = (input) =>
  String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Generate a unique slug. If `baseSlug` is taken, append -2, -3, ... until free.
 * `ignoreProductId` lets the update flow keep its own slug when the title hasn't
 * conflicted with anyone else.
 */
const generateUniqueSlug = async (rawValue, ignoreProductId = null) => {
  const base = slugify(rawValue);
  if (!base) {
    throw new HttpError("Title is required to generate a slug", 400);
  }

  let candidate = base;
  let suffix = 2;
  // Cap retries at 50 to avoid pathological loops on heavily contested slugs.
  for (let attempts = 0; attempts < 50; attempts += 1) {
    const filter = { slug: candidate, isDeleted: { $ne: true } };
    if (ignoreProductId) filter._id = { $ne: ignoreProductId };
    const exists = await Product.findOne(filter).select("_id").lean();
    if (!exists) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  throw new HttpError("Could not generate a unique slug", 500);
};

const parseJsonField = (value, fieldName) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      return JSON.parse(trimmed);
    } catch (_) {
      throw new HttpError(`${fieldName} must be a valid JSON array/object`, 400);
    }
  }
  throw new HttpError(`${fieldName} has an unsupported type`, 400);
};

const parseObjectIdArrayField = (value, fieldName) => {
  if (value === undefined || value === null) return undefined;

  let parsed = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch (_) {
      if (trimmed.includes(",")) {
        parsed = trimmed.split(",").map((item) => item.trim()).filter(Boolean);
      } else {
        parsed = [trimmed];
      }
    }
  }

  if (!Array.isArray(parsed)) {
    throw new HttpError(`${fieldName} must be an array of Pooja ids`, 400);
  }

  const objectIdRegex = /^[a-fA-F0-9]{24}$/;
  const ids = parsed.map((entry) => {
    if (entry && typeof entry === "object" && entry.id) {
      return String(entry.id).trim();
    }
    return String(entry).trim();
  });

  const invalidId = ids.find((id) => !objectIdRegex.test(id));
  if (invalidId) {
    throw new HttpError(`${fieldName} must contain valid ObjectId values`, 400);
  }

  return ids;
};

const buildAssociatePujaSnapshots = async (poojaIds) => {
  if (!poojaIds?.length) return [];

  const rows = await Pooja.find({ _id: { $in: poojaIds } })
    .select("title date status deity")
    .lean();

  const byId = new Map(rows.map((row) => [String(row._id), row]));

  return poojaIds.map((poojaId) => {
    const row = byId.get(String(poojaId));
    if (!row) {
      throw new HttpError(`associate_puja id ${poojaId} is invalid`, 400);
    }
    return {
      id: row._id,
      title: row.title,
      date: row.date,
      status: row.status,
      deity: row.deity,
    };
  });
};

const normalizeBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return undefined;
};

const normalizeNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Convert raw multipart/JSON input into a clean payload ready for Mongo.
 * Centralized so create + update share the same coercion logic.
 */
const buildProductPayload = (body = {}) => {
  const payload = {};

  if (body.title !== undefined) payload.title = String(body.title).trim();
  if (body.description !== undefined) payload.description = String(body.description).trim();
  if (body.currency !== undefined) payload.currency = String(body.currency).trim().toUpperCase();

  if (body.deity !== undefined) payload.deity = body.deity || null;
  if (body.associate_puja !== undefined) {
    payload.associatePujaIds = parseObjectIdArrayField(
      body.associate_puja,
      "associate_puja"
    );
  }
  if (body.category !== undefined) {
    const c = String(body.category).trim();
    if (!PRODUCT_CATEGORIES.includes(c)) {
      throw new HttpError(`category must be one of: ${PRODUCT_CATEGORIES.join(", ")}`, 400);
    }
    payload.category = c;
  }

  // Review workflow status (DRAFT/PENDING/...). Validation restricts admin
  // inputs to DRAFT|PENDING on create/update.
  if (body.status !== undefined) payload.status = body.status;
  // Publish toggle (ACTIVE/INACTIVE) — independent of review status.
  if (body.productStatus !== undefined) payload.productStatus = body.productStatus;

  const isFeatured = normalizeBoolean(body.isFeatured);
  if (isFeatured !== undefined) payload.isFeatured = isFeatured;

  const price = normalizeNumber(body.price);
  if (price !== undefined) payload.price = price;

  if (body.salePrice !== undefined) {
    if (body.salePrice === null || body.salePrice === "") {
      payload.salePrice = null;
    } else {
      const sp = normalizeNumber(body.salePrice);
      if (sp !== undefined) payload.salePrice = sp;
    }
  }

  if (body.items !== undefined) {
    const items = parseJsonField(body.items, "items");
    if (!Array.isArray(items)) {
      throw new HttpError("items must be an array", 400);
    }
    if (items.length === 0) {
      payload.items = [];
    } else {
      payload.items = items.map((it, idx) => {
      if (!it || typeof it !== "object") {
        throw new HttpError(`items[${idx}] must be an object`, 400);
      }
      const inventoryItem = String(it.inventoryItem || "").trim();
      const qty = inventoryService.parseKitLineQuantity(it.quantity);
      if (!inventoryItem || inventoryItem.length !== 24) {
        throw new HttpError(`items[${idx}] requires a valid inventoryItem id`, 400);
      }
      if (!qty) {
        throw new HttpError(`items[${idx}] requires a positive numeric quantity`, 400);
      }
      return { inventoryItem, quantity: qty };
      });
    }
  }

  const rawQuantity = resolveProductQuantityInput(body);
  if (rawQuantity !== undefined) {
    if (rawQuantity === null || rawQuantity === "") {
      payload.quantity = null;
    } else {
      const qty = normalizeNumber(rawQuantity);
      if (qty === undefined) {
        throw new HttpError("quantity must be a valid number", 400);
      }
      if (qty < 0) {
        throw new HttpError("quantity must be a non-negative number", 400);
      }
      payload.quantity = Math.floor(qty);
    }
  }

  if (body.slug !== undefined) payload.slug = slugify(body.slug);

  return payload;
};

const productPopulatePaths = () => [
  { path: "deity", select: "name deity_color" },
  { path: "associate_puja.deity", select: "name deity_color" },
  { path: "items.inventoryItem" },
  { path: "createdBy", select: "fullName email role" },
];

const assertInventoryItemsValid = async (kitItems) => {
  if (!kitItems?.length) return;
  const ids = kitItems
    .map((l) => inventoryService.resolveInventoryItemId(l.inventoryItem))
    .filter(Boolean);
  const rows = await InventoryItem.find({
    _id: { $in: ids },
    isDeleted: { $ne: true },
    status: "ACTIVE",
  })
    .select("_id name")
    .lean();
  if (rows.length !== ids.length) {
    throw new HttpError(
      "One or more inventory items are missing, inactive, or deleted",
      400
    );
  }
};

const assertCategoryFieldRules = (category, { items, quantity } = {}) => {
  if (!usesProductQuantity(category)) {
    if (!items || items.length === 0) {
      throw new HttpError("items is required for pujakit products", 400);
    }
    return;
  }

  if (quantity === undefined || quantity === null) {
    throw new HttpError("quantity is required for ayurvedic and book products", 400);
  }
  if (Number(quantity) < 0) {
    throw new HttpError("quantity must be a non-negative number", 400);
  }
};

const assertPriceConsistency = (price, salePrice) => {
  if (
    salePrice !== undefined &&
    salePrice !== null &&
    price !== undefined &&
    price !== null &&
    Number(salePrice) > Number(price)
  ) {
    throw new HttpError("salePrice must be less than or equal to price", 400);
  }
};

// ── CRUD ─────────────────────────────────────────────────────────────────────

const createProduct = async ({ body, imageUrl, userId }) => {
  const payload = buildProductPayload(body);

  if (!payload.title) throw new HttpError("title is required", 400);
  if (payload.price === undefined) throw new HttpError("price is required", 400);

  const category = payload.category || PRODUCT_CATEGORY_PUJA_KIT;
  payload.category = category;
  const items = payload.items || [];
  payload.items = items;
  if (usesProductQuantity(category)) {
    assertCategoryFieldRules(category, { quantity: payload.quantity });
  } else {
    payload.quantity = null;
    assertCategoryFieldRules(category, { items });
  }
  if (items.length) await assertInventoryItemsValid(items);
  if (payload.associatePujaIds !== undefined) {
    payload.associate_puja = await buildAssociatePujaSnapshots(
      payload.associatePujaIds
    );
    delete payload.associatePujaIds;
  }
  assertPriceConsistency(payload.price, payload.salePrice);

  payload.slug = await generateUniqueSlug(payload.slug || payload.title);
  if (imageUrl) payload.imageUrl = imageUrl;
  payload.createdBy = userId;

  try {
    const product = await Product.create(payload);
    await product.populate(productPopulatePaths());
    return inventoryService.enrichProductStock(product);
  } catch (err) {
    if (err.code === 11000) {
      throw new HttpError("A product with this slug already exists", 409);
    }
    throw err;
  }
};

const updateProduct = async ({ id, body, imageUrl }) => {
  const existing = await Product.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!existing) throw new HttpError("Product not found", 404);

  const payload = buildProductPayload(body);

  const mergedCategory = payload.category ?? existing.category ?? PRODUCT_CATEGORY_PUJA_KIT;
  const mergedItems =
    payload.items !== undefined ? payload.items : existing.items || [];
  const mergedQuantity =
    payload.quantity !== undefined ? payload.quantity : existing.quantity;

  if (usesProductQuantity(mergedCategory)) {
    assertCategoryFieldRules(mergedCategory, { quantity: mergedQuantity });
  } else {
    payload.quantity = null;
    assertCategoryFieldRules(mergedCategory, { items: mergedItems });
  }
  if (payload.items?.length) await assertInventoryItemsValid(payload.items);

  if (payload.associatePujaIds !== undefined) {
    payload.associate_puja = await buildAssociatePujaSnapshots(
      payload.associatePujaIds
    );
    delete payload.associatePujaIds;
  }

  // Validate consistency against the resulting merged document.
  const mergedPrice = payload.price !== undefined ? payload.price : existing.price;
  const mergedSale =
    payload.salePrice !== undefined ? payload.salePrice : existing.salePrice;
  assertPriceConsistency(mergedPrice, mergedSale);

  // Regenerate slug only when title changes or an explicit slug is supplied.
  if (payload.title && payload.title !== existing.title && payload.slug === undefined) {
    payload.slug = await generateUniqueSlug(payload.title, existing._id);
  } else if (payload.slug && payload.slug !== existing.slug) {
    payload.slug = await generateUniqueSlug(payload.slug, existing._id);
  }

  let previousImageUrl = null;
  if (imageUrl) {
    previousImageUrl = existing.imageUrl;
    payload.imageUrl = imageUrl;
  }

  Object.assign(existing, payload);
  try {
    await existing.save();
  } catch (err) {
    if (err.code === 11000) {
      throw new HttpError("A product with this slug already exists", 409);
    }
    throw err;
  }

  // Best-effort cleanup of the replaced image. Failures here are non-fatal.
  if (previousImageUrl) {
    deleteFile(previousImageUrl).catch(() => {});
  }

  await existing.populate(productPopulatePaths());
  return inventoryService.enrichProductStock(existing);
};

/**
 * Soft-delete by default. Use { hard: true } to permanently remove (also
 * tries to remove the S3 image).
 *
 * Soft-delete only touches the publish toggle (productStatus). Review status
 * (status) is left alone so admins can restore without re-running review.
 */
const deleteProduct = async (id, { hard = false } = {}) => {
  const product = await Product.findById(id);
  if (!product || product.isDeleted) {
    throw new HttpError("Product not found", 404);
  }

  if (hard) {
    if (product.imageUrl) deleteFile(product.imageUrl).catch(() => {});
    await product.deleteOne();
    return { id, hardDeleted: true };
  }

  product.isDeleted = true;
  product.productStatus = "INACTIVE";
  await product.save();
  return { id, hardDeleted: false };
};

const restoreProduct = async (id) => {
  const product = await Product.findById(id);
  if (!product) throw new HttpError("Product not found", 404);
  if (!product.isDeleted) return product;
  product.isDeleted = false;
  product.productStatus = "ACTIVE";
  await product.save();
  return product;
};

// ── Filters ─────────────────────────────────────────────────────────────────

/**
 * A product is publicly buyable only when it has been approved AND is currently
 * published AND has not been soft-deleted.
 */
const publicBuyableFilter = () => ({
  isDeleted: { $ne: true },
  status: "APPROVED",
  productStatus: "ACTIVE",
});

const buildListFilter = (query, viewer) => {
  const filter = {};

  if (viewer === "public") {
    Object.assign(filter, publicBuyableFilter());
  } else {
    const includeDeleted = normalizeBoolean(query.includeDeleted) === true;
    if (!includeDeleted) filter.isDeleted = { $ne: true };
    if (query.status) filter.status = query.status;
    if (query.productStatus) filter.productStatus = query.productStatus;
  }

  if (query.deity) filter.deity = query.deity;
  if (query.category) filter.category = query.category;

  const isFeatured = normalizeBoolean(query.isFeatured);
  if (isFeatured !== undefined) filter.isFeatured = isFeatured;

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.price = {};
    if (query.minPrice !== undefined) filter.price.$gte = Number(query.minPrice);
    if (query.maxPrice !== undefined) filter.price.$lte = Number(query.maxPrice);
  }

  if (query.search) {
    Object.assign(filter, buildProductSearchFilter(query.search) || {});
  }

  return filter;
};

// ── Reads ───────────────────────────────────────────────────────────────────

const getProductById = async (id, { viewer = "public" } = {}) => {
  const filter = { _id: id };
  if (viewer === "public") {
    Object.assign(filter, publicBuyableFilter());
  } else {
    filter.isDeleted = { $ne: true };
  }
  const product = await Product.findOne(filter).populate(productPopulatePaths());
  if (!product) throw new HttpError("Product not found", 404);

  // Fire-and-forget view counter for analytics; never block the request.
  Product.updateOne({ _id: product._id }, { $inc: { viewCount: 1 } }).catch(() => {});

  return inventoryService.enrichProductStock(product);
};

const paginatedFind = async (filter, query) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const sortBy = query.sortBy || "createdAt";
  const sortOrder = query.sortOrder === "asc" ? 1 : -1;
  const sort = { [sortBy]: sortOrder };

  const inStock = normalizeBoolean(query.inStock);

  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate(productPopulatePaths()),
    Product.countDocuments(filter),
  ]);

  let products = await inventoryService.enrichProductsStock(items);
  if (inStock === true) products = products.filter((p) => p.inStock);
  if (inStock === false) products = products.filter((p) => !p.inStock);

  return {
    products,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

const listProducts = async (query = {}, { viewer = "public" } = {}) => {
  const filter = buildListFilter(query, viewer);
  return paginatedFind(filter, query);
};

/**
 * Superadmin "see everything" listing — no review/publish filter unless one
 * is explicitly requested. Soft-deleted are excluded by default.
 */
const listAllProducts = async (query = {}) => {
  const filter = {};
  const includeDeleted = normalizeBoolean(query.includeDeleted) === true;
  if (!includeDeleted) filter.isDeleted = { $ne: true };
  if (query.status) filter.status = query.status;
  if (query.productStatus) filter.productStatus = query.productStatus;
  if (query.search) {
    Object.assign(filter, buildProductSearchFilter(query.search) || {});
  }
  return paginatedFind(filter, query);
};

/**
 * Admin-scoped listing — products created by the calling admin, any review status.
 */
const listMyProducts = async (userId, query = {}) => {
  const filter = { createdBy: userId };
  const includeDeleted = normalizeBoolean(query.includeDeleted) === true;
  if (!includeDeleted) filter.isDeleted = { $ne: true };
  if (query.status) filter.status = query.status;
  if (query.productStatus) filter.productStatus = query.productStatus;
  if (query.search) {
    Object.assign(filter, buildProductSearchFilter(query.search) || {});
  }
  return paginatedFind(filter, query);
};

// ── Writes (admin / superadmin) ─────────────────────────────────────────────

/**
 * Admin toggle for the publish flag (productStatus). Does NOT affect review status.
 */
const setProductStatus = async (id, productStatus) => {
  const product = await Product.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!product) throw new HttpError("Product not found", 404);
  product.productStatus = productStatus;
  await product.save();
  await product.populate(productPopulatePaths());
  return product;
};

const setFeatured = async (id, isFeatured) => {
  const product = await Product.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!product) throw new HttpError("Product not found", 404);
  product.isFeatured = !!isFeatured;
  await product.save();
  await product.populate(productPopulatePaths());
  return product;
};

/**
 * Superadmin-only: move a product through the review workflow. Mirrors
 * `reviewPooja` — flips `status` and saves; does not touch publish toggle.
 */
const reviewProduct = async (id, status) => {
  const product = await Product.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!product) throw new HttpError("Product not found", 404);
  product.status = status;
  await product.save();
  await product.populate(productPopulatePaths());
  return product;
};

const getFeaturedProducts = async ({ limit = 10 } = {}) => {
  const items = await Product.find({
    ...publicBuyableFilter(),
    isFeatured: true,
  })
    .sort({ updatedAt: -1 })
    .limit(Math.min(Number(limit) || 10, 100))
    .populate([
      { path: "deity", select: "name deity_color" },
      { path: "associate_puja.deity", select: "name deity_color" },
      { path: "items.inventoryItem" },
    ]);
  return inventoryService.enrichProductsStock(items);
};

const getPopularProducts = async ({ limit = 10 } = {}) => {
  const items = await Product.find(publicBuyableFilter())
    .sort({ purchaseCount: -1, viewCount: -1 })
    .limit(Math.min(Number(limit) || 10, 100))
    .populate([
      { path: "deity", select: "name deity_color" },
      { path: "associate_puja.deity", select: "name deity_color" },
      { path: "items.inventoryItem" },
    ]);
  return inventoryService.enrichProductsStock(items);
};

module.exports = {
  createProduct,
  updateProduct,
  deleteProduct,
  restoreProduct,
  getProductById,
  listProducts,
  listAllProducts,
  listMyProducts,
  setProductStatus,
  setFeatured,
  reviewProduct,
  getFeaturedProducts,
  getPopularProducts,
  // exported for unit tests
  _internal: { slugify, buildProductPayload, generateUniqueSlug, publicBuyableFilter },
};
