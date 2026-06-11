const mongoose = require("mongoose");

/**
 * Pooja Kit Item
 *
 * Each pooja kit contains a fixed list of required items. `quantity` is kept as
 * a string on purpose because items mix scales (e.g. "500" grams, "2" pieces,
 * "0.5" kg). Free-form unit lets us cover grams / kg / liters / pieces / packets
 * without a brittle enum.
 */
/**
 * One line in a pooja kit — references warehouse stock (`InventoryItem`).
 * `quantity` = stock units consumed per kit (e.g. 2 packs where each pack is
 * `itemQuantity` + `unit` on the inventory row, such as 50 grams).
 */
/** Snapshot of a linked pooja stored on the product (denormalized for fast reads). */
const associatePujaSchema = new mongoose.Schema(
  {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pooja",
      required: true,
    },
    title: {
      type: String,
      trim: true,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED"],
      required: true,
    },
    deity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deity",
      required: true,
    },
  },
  { _id: false }
);

const poojaKitItemSchema = new mongoose.Schema(
  {
    inventoryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryItem",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.000001,
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

    /** Linked pooja snapshots: id, title, date, status, deity */
    associate_puja: {
      type: [associatePujaSchema],
      default: [],
    },

    category: {
      type: String,
      enum: ["ayurvedic", "pujakit"],
      default: "pujakit",
      required: true,
      index: true,
    },

    /** Stock units on hand — only used when category is ayurvedic */
    quantity: {
      type: Number,
      min: 0,
      default: null,
    },

    status: {
      type: String,
      enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED"],
      default: "PENDING",
    },

    productStatus: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
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
// Mongoose 9+ no longer passes a `next` callback to pre hooks. The hook must
// either return a Promise (async) or throw synchronously.
productSchema.pre("validate", function ensurePriceConsistency() {
  if (
    this.salePrice !== null &&
    this.salePrice !== undefined &&
    this.price !== null &&
    this.price !== undefined &&
    this.salePrice > this.price
  ) {
    throw new Error("salePrice cannot be greater than price");
  }

  if (this.category === "pujakit") {
    if (!this.items || this.items.length === 0) {
      throw new Error("At least one inventory item is required for pujakit products");
    }
    this.quantity = null;
    return;
  }

  if (this.category === "ayurvedic") {
    if (this.quantity === null || this.quantity === undefined) {
      throw new Error("quantity is required for ayurvedic products");
    }
  }
});

// ── Virtuals ─────────────────────────────────────────────────────────────────
productSchema.virtual("effectivePrice").get(function effectivePriceGetter() {
  return this.salePrice && this.salePrice > 0 ? this.salePrice : this.price;
});

productSchema.set("toJSON", { virtuals: true });
productSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Product", productSchema);
