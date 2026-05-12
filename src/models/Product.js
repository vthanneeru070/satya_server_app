const mongoose = require("mongoose");

/**
 * Pooja Kit Item
 *
 * Each pooja kit contains a fixed list of required items. `quantity` is kept as
 * a string on purpose because items mix scales (e.g. "500" grams, "2" pieces,
 * "0.5" kg). Free-form unit lets us cover grams / kg / liters / pieces / packets
 * without a brittle enum.
 */
const poojaKitItemSchema = new mongoose.Schema(
  {
    itemName: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: String,
      required: true,
      trim: true,
    },
    unit: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

/**
 * Product (Pooja Kit)
 *
 * Domain-specific catalog entry — NOT a generic ecommerce SKU. Each product is
 * one packaged spiritual kit with embedded required items.
 */
const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    imageUrl: {
      type: String,
      default: null,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },

    items: {
      type: [poojaKitItemSchema],
      default: [],
    },

    stockQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

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

    deity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deity",
      default: null,
      index: true,
    },
    category: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },

    // Analytics / merchandising flags
    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    purchaseCount: {
      type: Number,
      default: 0,
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
  { timestamps: true }
);

// ── Indexes for search & filter ──────────────────────────────────────────────
productSchema.index({ title: "text", description: "text" });
productSchema.index({ status: 1, isDeleted: 1 });
productSchema.index({ deity: 1, category: 1, status: 1 });

// ── Pre-save guards (defense in depth — validation also catches these) ───────
productSchema.pre("validate", function ensurePriceConsistency(next) {
  if (
    this.salePrice !== null &&
    this.salePrice !== undefined &&
    this.price !== null &&
    this.price !== undefined &&
    this.salePrice > this.price
  ) {
    return next(new Error("salePrice cannot be greater than price"));
  }
  if (this.stockQuantity !== undefined && this.stockQuantity < 0) {
    return next(new Error("stockQuantity cannot be negative"));
  }
  return next();
});

// ── Virtuals ─────────────────────────────────────────────────────────────────
productSchema.virtual("effectivePrice").get(function effectivePriceGetter() {
  return this.salePrice && this.salePrice > 0 ? this.salePrice : this.price;
});

productSchema.virtual("inStock").get(function inStockGetter() {
  return (this.stockQuantity || 0) > 0;
});

productSchema.set("toJSON", { virtuals: true });
productSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Product", productSchema);
