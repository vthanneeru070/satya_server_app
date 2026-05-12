const Product = require("../models/Product");
const HttpError = require("../utils/httpError");
const { deleteFile } = require("./s3Service");

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
  if (body.category !== undefined) {
    const c = String(body.category).trim();
    payload.category = c || null;
  }

  if (body.status !== undefined) payload.status = body.status;

  const isFeatured = normalizeBoolean(body.isFeatured);
  if (isFeatured !== undefined) payload.isFeatured = isFeatured;

  const stockQuantity = normalizeNumber(body.stockQuantity);
  if (stockQuantity !== undefined) payload.stockQuantity = Math.floor(stockQuantity);

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
    if (!Array.isArray(items) || items.length === 0) {
      throw new HttpError("items must be a non-empty array", 400);
    }
    payload.items = items.map((it, idx) => {
      if (!it || typeof it !== "object") {
        throw new HttpError(`items[${idx}] must be an object`, 400);
      }
      const itemName = String(it.itemName || "").trim();
      const quantity = String(it.quantity ?? "").trim();
      const unit = String(it.unit || "").trim();
      if (!itemName || !quantity || !unit) {
        throw new HttpError(
          `items[${idx}] requires itemName, quantity, and unit`,
          400
        );
      }
      return { itemName, quantity, unit };
    });
  }

  if (body.slug !== undefined) payload.slug = slugify(body.slug);

  return payload;
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
  if (payload.stockQuantity === undefined) {
    throw new HttpError("stockQuantity is required", 400);
  }
  if (!payload.items || payload.items.length === 0) {
    throw new HttpError("items is required", 400);
  }
  assertPriceConsistency(payload.price, payload.salePrice);

  payload.slug = await generateUniqueSlug(payload.slug || payload.title);
  if (imageUrl) payload.imageUrl = imageUrl;
  payload.createdBy = userId;

  try {
    const product = await Product.create(payload);
    return product;
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

  return existing;
};

/**
 * Soft-delete by default. Use { hard: true } to permanently remove (also
 * tries to remove the S3 image).
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
  product.status = "INACTIVE";
  await product.save();
  return { id, hardDeleted: false };
};

const restoreProduct = async (id) => {
  const product = await Product.findById(id);
  if (!product) throw new HttpError("Product not found", 404);
  if (!product.isDeleted) return product;
  product.isDeleted = false;
  product.status = "ACTIVE";
  await product.save();
  return product;
};

const getProductById = async (id, { viewer = "public" } = {}) => {
  const filter = { _id: id };
  if (viewer === "public") {
    filter.isDeleted = { $ne: true };
    filter.status = "ACTIVE";
  } else {
    filter.isDeleted = { $ne: true };
  }
  const product = await Product.findOne(filter)
    .populate("deity", "name")
    .populate("createdBy", "fullName email role");
  if (!product) throw new HttpError("Product not found", 404);

  // Fire-and-forget view counter for analytics; never block the request.
  Product.updateOne({ _id: product._id }, { $inc: { viewCount: 1 } }).catch(() => {});

  return product;
};

const buildListFilter = (query, viewer) => {
  const filter = {};

  if (viewer === "public") {
    filter.isDeleted = { $ne: true };
    filter.status = "ACTIVE";
  } else {
    const includeDeleted = normalizeBoolean(query.includeDeleted) === true;
    if (!includeDeleted) filter.isDeleted = { $ne: true };
    if (query.status) filter.status = query.status;
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

  const inStock = normalizeBoolean(query.inStock);
  if (inStock === true) filter.stockQuantity = { $gt: 0 };
  if (inStock === false) filter.stockQuantity = { $lte: 0 };

  if (query.search) {
    const safe = String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.title = { $regex: safe, $options: "i" };
  }

  return filter;
};

const listProducts = async (query = {}, { viewer = "public" } = {}) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const sortBy = query.sortBy || "createdAt";
  const sortOrder = query.sortOrder === "asc" ? 1 : -1;
  const sort = { [sortBy]: sortOrder };

  const filter = buildListFilter(query, viewer);

  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate("deity", "name")
      .populate("createdBy", "fullName email role"),
    Product.countDocuments(filter),
  ]);

  return {
    products: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

const setStatus = async (id, status) => {
  const product = await Product.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!product) throw new HttpError("Product not found", 404);
  product.status = status;
  await product.save();
  return product;
};

const setFeatured = async (id, isFeatured) => {
  const product = await Product.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!product) throw new HttpError("Product not found", 404);
  product.isFeatured = !!isFeatured;
  await product.save();
  return product;
};

const getFeaturedProducts = async ({ limit = 10 } = {}) => {
  return Product.find({
    isDeleted: { $ne: true },
    status: "ACTIVE",
    isFeatured: true,
  })
    .sort({ updatedAt: -1 })
    .limit(Math.min(Number(limit) || 10, 100))
    .populate("deity", "name");
};

const getPopularProducts = async ({ limit = 10 } = {}) => {
  return Product.find({
    isDeleted: { $ne: true },
    status: "ACTIVE",
  })
    .sort({ purchaseCount: -1, viewCount: -1 })
    .limit(Math.min(Number(limit) || 10, 100))
    .populate("deity", "name");
};

module.exports = {
  createProduct,
  updateProduct,
  deleteProduct,
  restoreProduct,
  getProductById,
  listProducts,
  setStatus,
  setFeatured,
  getFeaturedProducts,
  getPopularProducts,
  // exported for unit tests
  _internal: { slugify, buildProductPayload, generateUniqueSlug },
};
