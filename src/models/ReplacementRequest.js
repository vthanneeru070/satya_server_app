const mongoose = require("mongoose");

/**
 * Customer replacement flow for delivered paid orders. Original `Order` is never
 * mutated; a new `Order` with `orderType: REPLACEMENT` is spawned on admin approval.
 */
const replacementRequestSchema = new mongoose.Schema(
  {
    requestNumber: { type: String, required: true, unique: true, index: true },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** Original (NORMAL) order being replaced */
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    reason: { type: String, required: true, trim: true, maxlength: 2000 },
    images: { type: [String], default: [] },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "COMPLETED"],
      default: "PENDING",
      index: true,
    },
    adminRemarks: { type: String, default: "", trim: true, maxlength: 2000 },
    replacementOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },

    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

replacementRequestSchema.index({ order: 1, status: 1 });
replacementRequestSchema.index({ user: 1, createdAt: -1 });
replacementRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("ReplacementRequest", replacementRequestSchema);
