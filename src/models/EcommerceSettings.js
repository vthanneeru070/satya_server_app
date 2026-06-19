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
    deliveryCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: "ZAR",
      uppercase: true,
      trim: true,
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
    /** Orders at or above this subtotal get free delivery. Null = no free-delivery rule. */
    freeDeliveryMinimum: {
      type: Number,
      default: null,
      min: 0,
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
