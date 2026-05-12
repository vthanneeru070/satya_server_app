const mongoose = require("mongoose");

const shippingAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, trim: true },
    phone: { type: String, trim: true },
    addressLine1: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true, default: "South Africa" },
    postalCode: { type: String, trim: true },
  },
  { _id: false }
);

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 1 },
    /** Unit price at checkout (never trust client) */
    price: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    items: { type: [orderItemSchema], default: [] },
    totalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "ZAR", uppercase: true },

    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED", "REFUNDED"],
      default: "PENDING",
      index: true,
    },
    orderStatus: {
      type: String,
      enum: ["PLACED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"],
      default: "PLACED",
      index: true,
    },

    paymentMethod: {
      type: String,
      enum: ["PAYSTACK", "COD", "EFT"],
      default: "PAYSTACK",
    },

    shippingAddress: { type: shippingAddressSchema, default: undefined },

    /** Paystack / gateway transaction id after successful charge */
    transactionId: { type: String, default: null, index: true },
    /** Last Paystack reference used for initialize (for support / idempotency) */
    paystackReference: { type: String, default: null, index: true },

    /**
     * True after successful payment verification when stock was decremented.
     * Used for admin cancel → restock only when appropriate.
     */
    inventoryReserved: { type: Boolean, default: false, index: true },

    orderStatusHistory: [
      {
        status: { type: String, required: true },
        at: { type: Date, default: Date.now },
        note: { type: String, default: "" },
      },
    ],

    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);
