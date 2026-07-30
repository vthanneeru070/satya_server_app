const mongoose = require("mongoose");
const { affectedOrderItemSchema } = require("../utils/orderAffectedItems");
const { returnShipmentSchema } = require("./schemas/returnShipmentSchema");

const historyEntrySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    at: { type: Date, default: Date.now },
    note: { type: String, default: "" },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: false }
);

/**
 * Unified post-payment request lifecycle for an order (cancellation / refund).
 * Replacement shipments use `ReplacementRequest` + `/replacements` APIs instead.
 *
 * REFUND flow: PENDING → AWAITING_RETURN (approve) → refund after return received
 * → APPROVED (gateway pending) or COMPLETED (refunded).
 */
const orderRequestSchema = new mongoose.Schema(
  {
    requestNumber: { type: String, required: true, unique: true, index: true },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["CANCELLATION", "REFUND"],
      required: true,
      index: true,
    },
    reason: { type: String, default: "", trim: true, maxlength: 2000 },
    attachments: { type: [String], default: [] },

    /** Snapshot of how the original order was fulfilled (REFUND). */
    fulfillmentMethod: {
      type: String,
      enum: ["DELIVERY", "PICKUP"],
      default: "DELIVERY",
      index: true,
    },

    /** Line items the customer wants refunded (subset of original order). */
    affectedItems: {
      type: [affectedOrderItemSchema],
      default: [],
    },

    /** Amount to refund when return is received (major currency units). */
    refundAmount: { type: Number, default: null, min: 0 },

    /**
     * PENDING — opened by user
     * AWAITING_RETURN — approved; waiting for goods
     * APPROVED — refund initiated, gateway still pending
     * COMPLETED — refund settled
     * REJECTED — declined
     */
    status: {
      type: String,
      enum: ["PENDING", "AWAITING_RETURN", "APPROVED", "REJECTED", "COMPLETED"],
      default: "PENDING",
      index: true,
    },

    /** Physical return of the item before refund is paid out. */
    returnShipment: {
      type: returnShipmentSchema,
      default: () => ({}),
    },

    adminNote: { type: String, default: "" },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },

    /**
     * REPLACEMENT only — points at the new order spawned when admin approves.
     * Left null for CANCELLATION / REFUND requests.
     */
    replacementOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

    history: { type: [historyEntrySchema], default: [] },

    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

orderRequestSchema.index({ order: 1, type: 1, status: 1 });
orderRequestSchema.index({ user: 1, createdAt: -1 });
orderRequestSchema.index({
  "returnShipment.shipmentId": 1,
  "returnShipment.status": 1,
});

module.exports = mongoose.model("OrderRequest", orderRequestSchema);
