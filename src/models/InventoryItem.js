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

    // Current available stock
    stockQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    // Base unit
    unit: {
      type: String,
      required: true,
      trim: true,
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
inventoryItemSchema.virtual("isLowStock").get(function () {
  return (
    (this.stockQuantity || 0) <=
    (this.lowStockThreshold || 0)
  );
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