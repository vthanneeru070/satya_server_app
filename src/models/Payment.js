const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    paymentFor: {
      type: String,
      enum: ["ORDER"],
      default: "ORDER",
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "ZAR", uppercase: true },

    gateway: {
      type: String,
      enum: ["PAYSTACK"],
      default: "PAYSTACK",
      required: true,
    },

    /** Paystack transaction id (numeric in API, stored as string) */
    paymentId: { type: String, default: null, index: true },
    transactionId: { type: String, default: null, index: true },
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["SUCCESS", "FAILED", "PENDING"],
      default: "PENDING",
      index: true,
    },

    /** Full Paystack initialize + verify payloads for audit */
    response: { type: mongoose.Schema.Types.Mixed, default: null },

    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

paymentSchema.index({ order: 1, status: 1 });

module.exports = mongoose.model("Payment", paymentSchema);
