const mongoose = require("mongoose");

/**
 * Customer replacement request flow.
 *
 * Line items on the original `Order` are unchanged. Summary fields on the
 * original order (`replacementState`, `latestReplacementRequest`, …) are
 * updated by `replacementService` for admin / client UI. Approved requests
 * create a new REPLACEMENT `Order` and await return of the damaged item
 * (warehouse drop-off for pickup, courier collection for delivery).
 */

const returnShipmentSchema = new mongoose.Schema(
  {
    method: {
      type: String,
      enum: ["COURIER_COLLECTION", "WAREHOUSE_DROP_OFF"],
      default: "WAREHOUSE_DROP_OFF",
    },
    status: {
      type: String,
      enum: [
        "NOT_APPLICABLE",
        "AWAITING_RETURN",
        "RETURN_BOOKED",
        "RETURN_IN_TRANSIT",
        "RETURN_RECEIVED",
      ],
      default: "NOT_APPLICABLE",
      index: true,
    },
    instructions: { type: String, default: "", trim: true, maxlength: 2000 },
    provider: { type: String, default: "" },
    shipmentId: { type: String, default: "" },
    waybill: { type: String, default: "" },
    shortTrackingReference: { type: String, default: "" },
    trackingUrl: { type: String, default: "" },
    labelUrl: { type: String, default: "" },
    courierStatus: { type: String, default: "" },
    bookedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { _id: false }
);

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

    /** Snapshot of how the original order was fulfilled. */
    fulfillmentMethod: {
      type: String,
      enum: ["DELIVERY", "PICKUP"],
      default: "DELIVERY",
      index: true,
    },

    /** Return of damaged item before replacement is fulfilled. */
    returnShipment: {
      type: returnShipmentSchema,
      default: () => ({}),
    },

    /**
     * Replacement request lifecycle
     */
    status: {
      type: String,
      enum: [
        "REQUESTED",
        "APPROVED", // legacy — treated like AWAITING_RETURN
        "AWAITING_RETURN",
        "RETURN_RECEIVED",
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