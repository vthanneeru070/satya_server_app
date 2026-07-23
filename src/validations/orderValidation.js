const Joi = require("joi");

const objectIdHex = Joi.string().trim().hex().length(24);

const shippingAddressSchema = Joi.object({
  fullName: Joi.string().trim().min(2).max(120).required(),
  phone: Joi.string().trim().min(5).max(20).required(),
  addressLine1: Joi.string().trim().min(2).max(200).optional(),
  line1: Joi.string().trim().min(2).max(200).optional(),
  addressLine2: Joi.string().trim().max(200).allow("").optional(),
  city: Joi.string().trim().min(1).max(80).required(),
  state: Joi.string().trim().min(1).max(80).required(),
  suburb: Joi.string().trim().max(120).allow("").optional(),
  localArea: Joi.string().trim().max(120).allow("").optional(),
  enteredAddress: Joi.string().trim().max(500).allow("").optional(),
  postalCode: Joi.string().trim().min(3).max(20).optional(),
  pincode: Joi.string().trim().min(3).max(20).optional(),
  country: Joi.string().trim().min(2).max(80).default("South Africa"),
  lat: Joi.number().min(-90).max(90).optional().allow(null),
  lng: Joi.number().min(-180).max(180).optional().allow(null),
}).custom((value, helpers) => {
  const addressLine1 = (value.addressLine1 || value.line1 || "").trim();
  const postalCode = (value.postalCode || value.pincode || "").trim();
  if (!addressLine1) {
    return helpers.message({ custom: "addressLine1 or line1 is required" });
  }
  if (!postalCode) {
    return helpers.message({ custom: "postalCode or pincode is required" });
  }
  return { ...value, addressLine1, postalCode };
});

const pickupContactSchema = Joi.object({
  fullName: Joi.string().trim().min(2).max(120).required(),
  phone: Joi.string().trim().min(5).max(20).required(),
});

const fulfillmentFields = {
  fulfillmentMethod: Joi.string().valid("DELIVERY", "PICKUP").default("DELIVERY"),
  shippingServiceLevelCode: Joi.string().trim().uppercase().max(20).optional(),
  contact: pickupContactSchema.optional(),
  shippingAddress: shippingAddressSchema.optional(),
};

const assertFulfillmentPayload = (value, helpers) => {
  const method = value.fulfillmentMethod || "DELIVERY";
  if (method === "DELIVERY") {
    if (!value.shippingAddress) {
      return helpers.message({ custom: "shippingAddress is required for delivery" });
    }
    if (!value.shippingServiceLevelCode) {
      return helpers.message({
        custom: "shippingServiceLevelCode is required for delivery",
      });
    }
  } else {
    const hasContact =
      value.contact?.fullName &&
      value.contact?.phone;
    const hasAddrContact =
      value.shippingAddress?.fullName && value.shippingAddress?.phone;
    if (!hasContact && !hasAddrContact) {
      return helpers.message({
        custom: "contact (fullName, phone) is required for pickup",
      });
    }
  }
  return value;
};

const checkoutOrderSchema = Joi.object({
  ...fulfillmentFields,
}).custom(assertFulfillmentPayload);

const createOrderSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        productId: objectIdHex.required(),
        quantity: Joi.number().integer().min(1).max(999).required(),
      })
    )
    .optional(),
  paymentMethod: Joi.string().valid("COD", "EFT", "PAYSTACK", "PAYFAST").default("PAYFAST"),
  ...fulfillmentFields,
}).custom(assertFulfillmentPayload);

const orderIdParamsSchema = Joi.object({
  id: objectIdHex.required(),
});

const updateOrderStatusSchema = Joi.object({
  status: Joi.string()
    .valid(
      "PROCESSING",
      "READY_FOR_PICKUP",
      "SHIPPED",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "CANCELLED"
    )
    .required(),
  note: Joi.string().trim().max(300).allow("").optional(),
});

const updatePaymentSchema = Joi.object({
  paymentStatus: Joi.string()
    .valid(
      "PENDING",
      "PAID",
      "FAILED",
      "REFUNDED",
      "REFUND_INITIATED",
      "REFUND_FAILED"
    )
    .optional(),
  paymentMethod: Joi.string().valid("COD", "EFT", "PAYSTACK", "PAYFAST").optional(),
}).min(1);

const listOrdersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  orderStatus: Joi.string()
    .valid(
      "PLACED",
      "PROCESSING",
      "READY_FOR_PICKUP",
      "SHIPPED",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "FULFILLED",
      "CANCELLED"
    )
    .optional(),
  status: Joi.string()
    .valid(
      "PLACED",
      "PROCESSING",
      "READY_FOR_PICKUP",
      "SHIPPED",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "FULFILLED",
      "CANCELLED"
    )
    .optional(),
  fulfillmentMethod: Joi.string().valid("DELIVERY", "PICKUP").optional(),
  paymentStatus: Joi.string()
    .valid(
      "PENDING",
      "PAID",
      "FAILED",
      "REFUNDED",
      "REFUND_INITIATED",
      "REFUND_FAILED"
    )
    .optional(),
});

const adminListOrdersQuerySchema = listOrdersQuerySchema.append({
  user: objectIdHex.optional(),
  search: Joi.string().trim().max(60).optional(),
});

const payfastInitSchema = Joi.object({
  callbackUrl: Joi.string().uri().optional(),
});

/** @deprecated use payfastInitSchema */
const paystackInitSchema = payfastInitSchema;

const payfastVerifySchema = Joi.object({
  reference: Joi.string().trim().min(3).max(200).required(),
}).unknown(true);

/** @deprecated use payfastVerifySchema */
const paystackVerifySchema = payfastVerifySchema;

const setTrackingSchema = Joi.object({
  courier: Joi.string().trim().min(2).max(120).required(),
  trackingNumber: Joi.string().trim().min(2).max(120).required(),
  trackingUrl: Joi.string().trim().uri().max(2048).allow("").optional(),
});

const dispatchOrderSchema = Joi.object({
  courier: Joi.string().trim().min(2).max(120).optional(),
  trackingNumber: Joi.string().trim().min(2).max(120).optional(),
  trackingUrl: Joi.string().trim().uri().max(2048).allow("").optional(),
  note: Joi.string().trim().max(300).allow("").optional(),
  bookCourier: Joi.boolean().optional(),
}).custom((value, helpers) => {
  const hasCourier = Boolean(value.courier && value.trackingNumber);
  const hasNeither = !value.courier && !value.trackingNumber;
  if (!hasCourier && !hasNeither) {
    return helpers.message({
      custom: "Provide both courier and trackingNumber, or omit both to book The Courier Guy",
    });
  }
  return value;
});

const readyForPickupSchema = Joi.object({
  note: Joi.string().trim().max(300).allow("").optional(),
});

const confirmDeliverySchema = Joi.object({
  satisfied: Joi.boolean().required(),
  feedback: Joi.string().trim().max(2000).allow("").optional(),
});

const adminCancelPaidSchema = Joi.object({
  reason: Joi.string().trim().max(2000).allow("").optional(),
});

const adminInitiateRefundSchema = Joi.object({
  reason: Joi.string().trim().max(2000).allow("").optional(),
  adminNote: Joi.string().trim().max(2000).allow("").optional(),
});

const cancelMyOrderSchema = Joi.object({
  reason: Joi.string().trim().min(5).max(2000).required().messages({
    "any.required": "A cancellation reason is required",
    "string.min": "Cancellation reason must be at least 5 characters",
    "string.max": "Cancellation reason must be at most 2000 characters",
  }),
});

const shippingQuoteSchema = Joi.object({
  shippingAddress: shippingAddressSchema.required(),
  declaredValue: Joi.number().min(0).optional(),
});

module.exports = {
  shippingAddressSchema,
  checkoutOrderSchema,
  createOrderSchema,
  orderIdParamsSchema,
  updateOrderStatusSchema,
  updatePaymentSchema,
  listOrdersQuerySchema,
  adminListOrdersQuerySchema,
  payfastInitSchema,
  payfastVerifySchema,
  paystackInitSchema,
  paystackVerifySchema,
  setTrackingSchema,
  dispatchOrderSchema,
  readyForPickupSchema,
  confirmDeliverySchema,
  adminCancelPaidSchema,
  adminInitiateRefundSchema,
  cancelMyOrderSchema,
  shippingQuoteSchema,
};
