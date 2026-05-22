const mongoose = require("mongoose");

const shippingAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, trim: true },
    phone: { type: String, trim: true },

    addressLine1: { type: String, trim: true },
    addressLine2: { type: String, trim: true, default: "" },

    city: { type: String, trim: true },
    state: { type: String, trim: true },

    country: {
      type: String,
      trim: true,
      default: "South Africa",
    },

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

    title: {
      type: String,
      required: true,
      trim: true,
    },

    imageUrl: {
      type: String,
      default: "",
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    /** Unit price at checkout */
    price: {
      type: Number,
      required: true,
      min: 0,
    },

    lineTotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const orderHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true,
    },

    at: {
      type: Date,
      default: Date.now,
    },

    note: {
      type: String,
      default: "",
    },
  },
  { _id: true }
);

/** Admin who initiated a Paystack refund (direct refund or cancel-with-refund). */
const refundedBySchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fullName: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true },
  },
  { _id: false }
);

/** Set when orderStatus becomes CANCELLED (user or admin). */
const cancelOrderSchema = new mongoose.Schema(
  {
    canceledBy: {
      type: String,
      enum: ["user", "admin"],
      required: true,
    },
    cancelReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    canceledAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
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

    items: {
      type: [orderItemSchema],
      default: [],
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "ZAR",
      uppercase: true,
    },

    paymentStatus: {
      type: String,
      enum: [
        "PENDING",
        "PAID",
        "FAILED",
        "REFUND_INITIATED",
        "REFUNDED",
        "REFUND_FAILED",
      ],
      default: "PENDING",
      index: true,
    },

    orderStatus: {
      type: String,
      enum: [
        "PLACED",
        "PROCESSING",
        "SHIPPED",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "FULFILLED",
        "CANCELLED",
      ],
      default: "PLACED",
      index: true,
    },

    paymentMethod: {
      type: String,
      enum: ["PAYSTACK", "COD", "EFT"],
      default: "PAYSTACK",
    },

    shippingAddress: {
      type: shippingAddressSchema,
      default: undefined,
    },

    /**
     * Payment transaction
     */
    transactionId: {
      type: String,
      default: null,
      index: true,
    },

    /**
     * Payment gateway reference
     */
    paystackReference: {
      type: String,
      default: null,
      index: true,
    },

    /**
     * Original payment audit fields
     * Used for replacement orders
     */
    originalTransactionId: {
      type: String,
      default: "",
    },

    originalPaystackReference: {
      type: String,
      default: "",
    },

    /**
     * Stock reserved after payment verification
     */
    inventoryReserved: {
      type: Boolean,
      default: false,
      index: true,
    },

    tracking: {
      courier: {
        type: String,
        default: "",
      },

      trackingNumber: {
        type: String,
        default: "",
      },

      trackingUrl: {
        type: String,
        default: "",
      },

      dispatchedAt: {
        type: Date,
        default: null,
      },

      deliveredAt: {
        type: Date,
        default: null,
      },

      sharedWithUserAt: {
        type: Date,
        default: null,
      },
    },

    invoice: {
      number: {
        type: String,
        default: "",
      },

      url: {
        type: String,
        default: "",
      },

      generatedAt: {
        type: Date,
        default: null,
      },
    },

    fulfillment: {
      satisfied: {
        type: Boolean,
        default: null,
      },

      ratedAt: {
        type: Date,
        default: null,
      },

      feedback: {
        type: String,
        default: "",
      },
    },

    refund: {
      status: {
        type: String,
        enum: ["NONE", "PENDING", "PROCESSED", "FAILED"],
        default: "NONE",
      },

      paystackRefundId: {
        type: String,
        default: "",
      },

      amount: {
        type: Number,
        default: 0,
      },

      currency: {
        type: String,
        default: "",
      },

      attemptedAt: {
        type: Date,
        default: null,
      },

      processedAt: {
        type: Date,
        default: null,
      },

      lastError: {
        type: String,
        default: "",
      },

      reason: {
        type: String,
        default: "",
        trim: true,
        maxlength: 2000,
      },

      adminNote: {
        type: String,
        default: "",
        trim: true,
        maxlength: 2000,
      },

      refundedBy: {
        type: refundedBySchema,
        default: null,
      },
    },

    /** Populated when the order is cancelled (see executeOrderCancellation). */
    cancelOrder: {
      type: cancelOrderSchema,
      default: null,
    },

    /**
     * NORMAL
     * REPLACEMENT
     */
    orderType: {
      type: String,
      enum: ["NORMAL", "REPLACEMENT"],
      default: "NORMAL",
      index: true,
    },

    /**
     * Original order reference
     * only for REPLACEMENT orders
     */
    replacementFor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },

    /**
     * Parent order number
     * Example:
     * SATYA-10028
     */
    parentOrderNumber: {
      type: String,
      default: "",
    },

    replacementReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },

    /**
     * Lightweight replacement state
     * for original order UI
     */
    replacementState: {
      type: String,
      enum: [
        "NONE",
        "REQUESTED",
        "APPROVED",
        "REJECTED",
        "IN_PROGRESS",
        "COMPLETED",
      ],
      default: "NONE",
      index: true,
    },

    replacementCount: {
      type: Number,
      default: 0,
    },

    latestReplacementRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReplacementRequest",
      default: null,
    },

    latestReplacementOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

    orderStatusHistory: {
      type: [orderHistorySchema],
      default: [],
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

orderSchema.index({ createdAt: -1 });

orderSchema.index({
  user: 1,
  createdAt: -1,
});

orderSchema.index({
  orderType: 1,
  replacementFor: 1,
});

orderSchema.index({
  replacementFor: 1,
  createdAt: -1,
});

orderSchema.index({
  replacementState: 1,
});

module.exports = mongoose.model("Order", orderSchema);