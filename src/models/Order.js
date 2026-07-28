const mongoose = require("mongoose");

const shippingAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, trim: true },
    phone: { type: String, trim: true },

    addressLine1: { type: String, trim: true },
    addressLine2: { type: String, trim: true, default: "" },

    city: { type: String, trim: true },
    state: { type: String, trim: true },
    suburb: { type: String, trim: true, default: "" },
    localArea: { type: String, trim: true, default: "" },
    enteredAddress: { type: String, trim: true, default: "" },

    country: {
      type: String,
      trim: true,
      default: "South Africa",
    },

    postalCode: { type: String, trim: true },

    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  { _id: false }
);

const shippingQuoteSchema = new mongoose.Schema(
  {
    provider: { type: String, default: "TCG" },
    serviceLevelCode: { type: String, trim: true, default: "" },
    serviceLevelName: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    rate: { type: Number, min: 0, default: 0 },
    rateExcludingVat: { type: Number, min: 0, default: 0 },
    rateRevisionId: { type: mongoose.Schema.Types.Mixed, default: null },
    serviceLevelId: { type: mongoose.Schema.Types.Mixed, default: null },
    quotedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    customerCharged: { type: Number, min: 0, default: 0 },
    subsidized: { type: Boolean, default: false },
  },
  { _id: false }
);

const deliveryPodSchema = new mongoose.Schema(
  {
    status: { type: String, default: "" },
    message: { type: String, default: "" },
    verifiedAt: { type: Date, default: null },
    eventId: { type: String, default: "" },
    digitalPodUrl: { type: String, default: "" },
    imageUrls: { type: [String], default: [] },
    imageFileNames: { type: [String], default: [] },
    lastSyncedAt: { type: Date, default: null },
  },
  { _id: false }
);

const deliverySchema = new mongoose.Schema(
  {
    provider: { type: String, default: "TCG" },
    shipmentId: { type: String, default: "", index: true },
    waybill: { type: String, default: "", index: true },
    shortTrackingReference: { type: String, default: "" },
    labelUrl: { type: String, default: "" },
    stickerUrl: { type: String, default: "" },
    status: { type: String, default: "" },
    bookedAt: { type: Date, default: null },
    lastSyncedAt: { type: Date, default: null },
    bookedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    podMethod: { type: String, default: "" },
    pod: {
      type: deliveryPodSchema,
      default: undefined,
    },
  },
  { _id: false }
);

const pickupCollectionSchema = new mongoose.Schema(
  {
    code: { type: String, trim: true, default: "" },
    generatedAt: { type: Date, default: null },
  },
  { _id: false }
);

const pickupCredentialsSchema = new mongoose.Schema(
  {
    pin: { type: String, trim: true, default: "" },
    qrToken: { type: String, trim: true, default: "" },
    issuedAt: { type: Date, default: null },
    collectedAt: { type: Date, default: null },
    collectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { _id: false }
);

const pickupLocationSchema = new mongoose.Schema(
  {
    company: { type: String, default: "" },
    streetAddress: { type: String, default: "" },
    localArea: { type: String, default: "" },
    city: { type: String, default: "" },
    zone: { type: String, default: "" },
    postalCode: { type: String, default: "" },
    country: { type: String, default: "South Africa" },
    enteredAddress: { type: String, default: "" },
    contactName: { type: String, default: "" },
    contactPhone: { type: String, default: "" },
    contactEmail: { type: String, default: "" },
    hours: { type: String, default: "" },
    instructions: { type: String, default: "" },
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

    /** Product lines total before delivery charge */
    subtotal: {
      type: Number,
      default: 0,
      min: 0,
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
        "PACKED",
        "READY_FOR_PICKUP",
        "COLLECTED",
        "SHIPPED",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "FULFILLED",
        "CANCELLED",
      ],
      default: "PLACED",
      index: true,
    },

    /** How the customer receives the order. */
    fulfillmentMethod: {
      type: String,
      enum: ["DELIVERY", "PICKUP"],
      default: "DELIVERY",
      index: true,
    },

    paymentMethod: {
      type: String,
      enum: ["PAYSTACK", "PAYFAST", "COD", "EFT"],
      default: "PAYFAST",
    },

    shippingAddress: {
      type: shippingAddressSchema,
      default: undefined,
    },

    /** Snapshot of The Courier Guy rate chosen at checkout (Delivery only). */
    shippingQuote: {
      type: shippingQuoteSchema,
      default: undefined,
    },

    /** Live courier shipment / waybill details (Delivery only). */
    delivery: {
      type: deliverySchema,
      default: undefined,
    },

    /** Warehouse snapshot for Pickup orders. */
    pickupLocation: {
      type: pickupLocationSchema,
      default: undefined,
    },

    /** Assigned pickup warehouse (Pickup orders). */
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      default: null,
      index: true,
    },

    /** One-time code for warehouse pickup verification. */
    pickupCollection: {
      type: pickupCollectionSchema,
      default: undefined,
    },

    /** PIN + QR metadata for pickup verification. */
    pickupCredentials: {
      type: pickupCredentialsSchema,
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

  /** Payment gateway reference (PayFast m_payment_id; legacy field name) */
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