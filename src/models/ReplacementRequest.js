const mongoose = require("mongoose");

/**
 * Customer replacement request flow.
 *
 * Line items on the original `Order` are unchanged. Summary fields on the
 * original order (`replacementState`, `latestReplacementRequest`, …) are
 * updated by `replacementService` for admin / client UI. Approved requests
 * create a new REPLACEMENT `Order`.
 */

const replacementRequestSchema = new mongoose.Schema(
  {
    requestNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /**
     * Original NORMAL order
     */
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    images: {
      type: [String],
      default: [],
    },

    /**
     * Replacement request lifecycle
     */
    status: {
      type: String,
      enum: [
        "REQUESTED",
        "APPROVED",
        "REJECTED",
        "PROCESSING",
        "SHIPPED",
        "DELIVERED",
        "CANCELLED",
      ],
      default: "REQUESTED",
      index: true,
    },

    adminRemarks: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },

    /**
     * Created after approval
     */
    replacementOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    rejectedAt: {
      type: Date,
      default: null,
    },

    cancellationReason: {
      type: String,
      default: "",
      trim: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

replacementRequestSchema.index({
  order: 1,
  status: 1,
});

replacementRequestSchema.index({
  user: 1,
  createdAt: -1,
});

replacementRequestSchema.index({
  status: 1,
  createdAt: -1,
});

module.exports = mongoose.model(
  "ReplacementRequest",
  replacementRequestSchema
);