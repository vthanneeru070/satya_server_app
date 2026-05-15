const mongoose = require("mongoose");

const inventoryItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    imageUrl: {
      type: String,
      default: null,
    },

    /** Master code — `masterdata/inventory/categories`, GET /inventory/categories */
    category: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    /**
     * Number of sellable units in warehouse (e.g. 50 packs).
     * Each unit holds `itemQuantity` of `unit` (e.g. 50 grams per pack).
     */
    stockQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    /** Amount per single stock unit (e.g. 50). */
    itemQuantity: {
      type: Number,
      required: true,
      min: 0.000001,
    },

    /** Measure for itemQuantity (e.g. grams, pieces, ml). */
    unit: {
      type: String,
      required: true,
      trim: true,
    },

    /** Unit list price (per one stock unit). */
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    salePrice: {
      type: Number,
      min: 0,
      default: null,
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: "ZAR",
      required: true,
    },

    supplierName: {
      type: String,
      trim: true,
      default: "",
    },

    lowStockThreshold: {
      type: Number,
      min: 0,
      default: 10,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// ── Indexes ──────────────────────────────────────────────────────────────
inventoryItemSchema.index({
  name: "text",
  description: "text",
});

inventoryItemSchema.index({
  category: 1,
  status: 1,
  isDeleted: 1,
});

// ── Virtuals ─────────────────────────────────────────────────────────────
/** Total amount in stock = stockQuantity × itemQuantity (e.g. 50 packs × 50g = 2500g). */
inventoryItemSchema.virtual("totalAvailableQuantity").get(function () {
  const units = Number(this.stockQuantity) || 0;
  const perUnit = Number(this.itemQuantity) || 0;
  return Math.round(units * perUnit * 1000) / 1000;
});

inventoryItemSchema.virtual("isLowStock").get(function () {
  return (
    (this.stockQuantity || 0) <=
    (this.lowStockThreshold || 0)
  );
});

inventoryItemSchema.virtual("effectivePrice").get(function () {
  return this.salePrice && this.salePrice > 0 ? this.salePrice : this.price;
});

inventoryItemSchema.pre("validate", function ensurePriceConsistency() {
  if (
    this.salePrice !== null &&
    this.salePrice !== undefined &&
    this.price !== null &&
    this.price !== undefined &&
    this.salePrice > this.price
  ) {
    throw new Error("salePrice cannot be greater than price");
  }
});

inventoryItemSchema.set("toJSON", {
  virtuals: true,
});

inventoryItemSchema.set("toObject", {
  virtuals: true,
});

module.exports = mongoose.model(
  "InventoryItem",
  inventoryItemSchema
);