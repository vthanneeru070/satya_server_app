const mongoose = require("mongoose");

/**
 * One PayFast attempt by one donor against one donation. Created in PENDING
 * status when the user initiates payment; flipped to PAID via ITN or verify.
 *
 * `user` is required for in-app (APP) donations. Website (WEBSITE) donations
 * leave `user` null and store optional donor contact fields instead.
 *
 * Schema change (Option A): making `user` optional is backward-compatible —
 * existing documents keep their user ObjectId. No data rewrite is required
 * before deploying the model change. See docs/migrations/donation-website-source.md.
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
      required: false,
      default: null,
      index: true,
    },

    /** Where the donation was initiated. */
    source: {
      type: String,
      enum: ["APP", "WEBSITE"],
      default: "APP",
      index: true,
    },

    /** Optional contact for anonymous website donations (PayFast email). */
    donorEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      default: null,
    },
    donorName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
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
      enum: ["PAYSTACK", "PAYFAST"],
      default: "PAYFAST",
    },

    /** PayFast or legacy gateway payment reference (legacy field name) */
    paystackReference: { type: String, default: null, index: true },
    transactionId: { type: String, default: null, index: true },

    note: { type: String, trim: true, maxlength: 280, default: "" },

    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

donationContributionSchema.index({ user: 1, createdAt: -1 });
donationContributionSchema.index({ donation: 1, paymentStatus: 1 });
donationContributionSchema.index({ source: 1, createdAt: -1 });

donationContributionSchema.virtual("paymentReference").get(function paymentReference() {
  return this.paystackReference || null;
});

donationContributionSchema.virtual("payfastPaymentId").get(function payfastPaymentId() {
  return this.transactionId || null;
});

donationContributionSchema.set("toJSON", { virtuals: true });
donationContributionSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model(
  "DonationContribution",
  donationContributionSchema
);
