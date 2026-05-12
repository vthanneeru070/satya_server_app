const Cart = require("../models/Cart");
const Product = require("../models/Product");
const HttpError = require("../utils/httpError");

const getOrCreateCart = async (userId) => {
  let cart = await Cart.findOne({ user: userId, isDeleted: { $ne: true } });
  if (!cart) {
    cart = await Cart.create({ user: userId, items: [], totalAmount: 0 });
  }
  return cart;
};

const recalcTotal = (cart) => {
  let total = 0;
  for (const it of cart.items) {
    total += Number(it.price) * Number(it.quantity);
  }
  cart.totalAmount = Math.round(total * 100) / 100;
};

const assertProductBuyable = (product, requestedQty) => {
  if (!product || product.isDeleted) {
    throw new HttpError("Product not found", 404);
  }
  if (product.status !== "ACTIVE") {
    throw new HttpError("This product is not available right now", 400);
  }
  if (product.stockQuantity <= 0) {
    throw new HttpError("This product is out of stock", 400);
  }
  if (requestedQty > product.stockQuantity) {
    throw new HttpError(
      `Only ${product.stockQuantity} unit(s) of "${product.title}" are in stock`,
      400
    );
  }
};

const unitPrice = (product) =>
  product.salePrice && product.salePrice > 0 ? product.salePrice : product.price;

/**
 * Cart wire shape with live catalog join for titles/images/stock warnings.
 */
const serializeCart = async (cart) => {
  if (!cart || cart.items.length === 0) {
    return {
      _id: cart?._id || null,
      user: cart?.user || null,
      items: [],
      itemCount: 0,
      totalAmount: cart?.totalAmount || 0,
      subtotal: cart?.totalAmount || 0,
      currency: cart?.currency || "ZAR",
      updatedAt: cart?.updatedAt || null,
    };
  }

  const productIds = cart.items.map((it) => it.product);
  const products = await Product.find({ _id: { $in: productIds } }).lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  let currency = cart.currency || "ZAR";
  const removedIdx = [];
  const lineItems = [];

  cart.items.forEach((ci, index) => {
    const product = productMap.get(String(ci.product));
    if (!product || product.isDeleted || product.status !== "ACTIVE") {
      removedIdx.push(index);
      return;
    }

    const liveUnit = unitPrice(product);
    const snapshotUnit = Number(ci.price);
    currency = product.currency || currency;

    lineItems.push({
      product: {
        _id: product._id,
        title: product.title,
        slug: product.slug,
        imageUrl: product.imageUrl,
        items: product.items,
        currency: product.currency,
        stockQuantity: product.stockQuantity,
        inStock: product.stockQuantity > 0,
      },
      quantity: ci.quantity,
      price: snapshotUnit,
      liveUnitPrice: liveUnit,
      priceChanged: Math.abs(snapshotUnit - liveUnit) > 0.009,
      lineTotal: snapshotUnit * ci.quantity,
      addedAt: ci.addedAt,
      lowStock: ci.quantity > product.stockQuantity,
    });
  });

  if (removedIdx.length > 0) {
    cart.items = cart.items.filter((_, i) => !removedIdx.includes(i));
    recalcTotal(cart);
    await cart.save();
  }

  return {
    _id: cart._id,
    user: cart.user,
    items: lineItems,
    itemCount: lineItems.reduce((sum, l) => sum + l.quantity, 0),
    totalAmount: cart.totalAmount,
    subtotal: cart.totalAmount,
    currency,
    updatedAt: cart.updatedAt,
  };
};

const getCart = async (userId) => {
  const cart = await getOrCreateCart(userId);
  return serializeCart(cart);
};

/**
 * Add or merge line. One row per product; price snapshot refreshed from catalog.
 */
const addItem = async (userId, { productId, quantity = 1 }) => {
  const qty = Math.floor(Number(quantity) || 1);
  if (qty < 1) throw new HttpError("quantity must be at least 1", 400);

  const product = await Product.findById(productId);
  const cart = await getOrCreateCart(userId);
  const existing = cart.items.find((it) => String(it.product) === String(productId));
  const newQty = (existing ? existing.quantity : 0) + qty;
  assertProductBuyable(product, newQty);

  const snap = unitPrice(product);
  if (existing) {
    existing.quantity = newQty;
    existing.price = snap;
  } else {
    cart.items.push({ product: productId, quantity: qty, price: snap, addedAt: new Date() });
  }
  if (product.currency) cart.currency = product.currency;
  recalcTotal(cart);
  await cart.save();
  return serializeCart(cart);
};

const updateQuantity = async (userId, { productId, quantity }) => {
  const qty = Math.floor(Number(quantity));
  if (!Number.isFinite(qty) || qty < 1) {
    throw new HttpError("quantity must be a positive integer", 400);
  }

  const cart = await getOrCreateCart(userId);
  const item = cart.items.find((it) => String(it.product) === String(productId));
  if (!item) throw new HttpError("Item not in cart", 404);

  const product = await Product.findById(productId);
  assertProductBuyable(product, qty);

  item.quantity = qty;
  item.price = unitPrice(product);
  if (product.currency) cart.currency = product.currency;
  recalcTotal(cart);
  await cart.save();
  return serializeCart(cart);
};

const removeItem = async (userId, { productId }) => {
  const cart = await getOrCreateCart(userId);
  const before = cart.items.length;
  cart.items = cart.items.filter((it) => String(it.product) !== String(productId));
  if (cart.items.length === before) {
    throw new HttpError("Item not in cart", 404);
  }
  recalcTotal(cart);
  await cart.save();
  return serializeCart(cart);
};

const clearCart = async (userId) => {
  const cart = await getOrCreateCart(userId);
  cart.items = [];
  cart.totalAmount = 0;
  await cart.save();
  return serializeCart(cart);
};

module.exports = {
  getCart,
  addItem,
  updateQuantity,
  removeItem,
  clearCart,
  _internal: { getOrCreateCart, serializeCart, assertProductBuyable, recalcTotal },
};
