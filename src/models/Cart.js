const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    /** Unit price snapshot (server-calculated at add/update time) */
    price: { type: Number, required: true, min: 0 },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
      validate: {
        validator(arr) {
          const ids = arr.map((i) => String(i.product));
          return new Set(ids).size === ids.length;
        },
        message: "Duplicate product in cart",
      },
    },
    /** Sum of (price * quantity) for all lines — maintained by cartService */
    totalAmount: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "ZAR", uppercase: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Cart", cartSchema);
