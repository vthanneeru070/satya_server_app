const mongoose = require("mongoose");

const SINGLETON_KEY = "default";

const ecommerceSettingsSchema = new mongoose.Schema(
  {
    singletonKey: {
      type: String,
      default: SINGLETON_KEY,
      unique: true,
      immutable: true,
    },
    /** South African (or store) VAT registration number shown on invoices. */
    vatNumber: {
      type: String,
      default: "",
      trim: true,
      maxlength: 64,
    },
    /** VAT % applied to product subtotal at checkout (not delivery). */
    vatPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    currency: {
      type: String,
      default: "ZAR",
      uppercase: true,
      trim: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EcommerceSettings", ecommerceSettingsSchema);
module.exports.SINGLETON_KEY = SINGLETON_KEY;
