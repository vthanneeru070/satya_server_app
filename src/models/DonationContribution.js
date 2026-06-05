const mongoose = require("mongoose");

/**
 * One Paystack attempt by one donor against one donation. Created in PENDING
 * status when the user initiates payment; flipped to PAID only via server-side
 * Paystack verify (`paymentService.verifyPaymentByReference`).
 */
const donationContributionSchema = new mongoose.Schema(
  {
    contributionNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    donation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Donation",
      default: null,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    amount: { type: Number, required: true, min: 0 },
    currency: {
      type: String,
      required: true,
      default: "ZAR",
      uppercase: true,
      trim: true,
    },

    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED", "REFUNDED"],
      default: "PENDING",
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ["PAYSTACK"],
      default: "PAYSTACK",
    },

    paystackReference: { type: String, default: null, index: true },
    transactionId: { type: String, default: null, index: true },

    note: { type: String, trim: true, maxlength: 280, default: "" },

    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

donationContributionSchema.index({ user: 1, createdAt: -1 });
donationContributionSchema.index({ donation: 1, paymentStatus: 1 });

module.exports = mongoose.model(
  "DonationContribution",
  donationContributionSchema
);
