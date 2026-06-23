const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /**
     * Optional after the polymorphic split — set only when paymentFor === "ORDER".
     * Donation payments leave this null and use `donationContribution` instead.
     */
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    donationContribution: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DonationContribution",
      default: null,
      index: true,
    },
    paymentFor: {
      type: String,
      enum: ["ORDER", "DONATION"],
      default: "ORDER",
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "ZAR", uppercase: true },

    gateway: {
      type: String,
      enum: ["PAYSTACK", "PAYFAST"],
      default: "PAYFAST",
      required: true,
    },

  /** PayFast (or legacy Paystack) transaction id */
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

    /** Full gateway initialize + verify / ITN payloads for audit */
    response: { type: mongoose.Schema.Types.Mixed, default: null },

    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

paymentSchema.index({ order: 1, status: 1 });
paymentSchema.index({ donationContribution: 1, status: 1 });

module.exports = mongoose.model("Payment", paymentSchema);
