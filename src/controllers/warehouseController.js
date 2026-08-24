const { sendSuccess } = require("../utils/response");
const Warehouse = require("../models/Warehouse");
const warehouseRoutingService = require("../services/warehouseRoutingService");
const Product = require("../models/Product");

const listWarehouses = async (_req, res, next) => {
  try {
    const rows = await Warehouse.find({ isActive: true, isDeleted: { $ne: true } })
      .sort({ name: 1 })
      .lean();
    return sendSuccess(res, { warehouses: rows }, "Warehouses fetched");
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /warehouses/for-cart
 * Body: { items: [{ productId, quantity }] } or { productIds: [...] }
 */
const warehouseForCart = async (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const productIds =
      items.length > 0
        ? items.map((it) => String(it.productId || it.product))
        : (req.body?.productIds || []).map(String);

    if (!productIds.length) {
      return res.status(400).json({
        success: false,
        message: "items or productIds are required",
      });
    }

    const products = await Product.find({
      _id: { $in: productIds },
      isDeleted: { $ne: true },
    }).select("_id category title quantity");

    const quantitiesById = {};
    for (const it of items) {
      const id = String(it.productId || it.product || "");
      if (id) {
        quantitiesById[id] = Math.max(1, Math.floor(Number(it.quantity) || 1));
      }
    }

    const availability = await warehouseRoutingService.buildAvailabilityForProducts(
      products,
      quantitiesById
    );

    return sendSuccess(
      res,
      {
        warehouse: {
          id: availability.warehouse._id,
          code: availability.warehouse.code,
          name: availability.warehouse.name,
        },
        location: availability.pickupLocation,
        lines: availability.lines,
        allInStock: availability.allInStock,
      },
      "Pickup warehouse resolved for cart"
    );
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listWarehouses,
  warehouseForCart,
};
