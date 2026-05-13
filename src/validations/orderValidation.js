const Joi = require("joi");

const objectIdHex = Joi.string().trim().hex().length(24);

const shippingAddressSchema = Joi.object({
  fullName: Joi.string().trim().min(2).max(120).required(),
  phone: Joi.string().trim().min(5).max(20).required(),
  addressLine1: Joi.string().trim().min(2).max(200).optional(),
  line1: Joi.string().trim().min(2).max(200).optional(),
  city: Joi.string().trim().min(1).max(80).required(),
  state: Joi.string().trim().min(1).max(80).required(),
  postalCode: Joi.string().trim().min(3).max(20).optional(),
  pincode: Joi.string().trim().min(3).max(20).optional(),
  country: Joi.string().trim().min(2).max(80).default("South Africa"),
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

const checkoutOrderSchema = Joi.object({
  shippingAddress: shippingAddressSchema.required(),
});

const createOrderSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        productId: objectIdHex.required(),
        quantity: Joi.number().integer().min(1).max(999).required(),
      })
    )
    .optional(),
  shippingAddress: shippingAddressSchema.required(),
  paymentMethod: Joi.string().valid("COD", "EFT", "PAYSTACK").default("PAYSTACK"),
});

const orderIdParamsSchema = Joi.object({
  id: objectIdHex.required(),
});

const updateOrderStatusSchema = Joi.object({
  status: Joi.string()
    .valid("PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED")
    .required(),
  note: Joi.string().trim().max(300).allow("").optional(),
});

const updatePaymentSchema = Joi.object({
  paymentStatus: Joi.string().valid("PENDING", "PAID", "FAILED", "REFUNDED").optional(),
  paymentMethod: Joi.string().valid("COD", "EFT", "PAYSTACK").optional(),
}).min(1);

const listOrdersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  orderStatus: Joi.string()
    .valid("PLACED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED")
    .optional(),
  status: Joi.string()
    .valid("PLACED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED")
    .optional(),
  paymentStatus: Joi.string().valid("PENDING", "PAID", "FAILED", "REFUNDED").optional(),
});

const adminListOrdersQuerySchema = listOrdersQuerySchema.append({
  user: objectIdHex.optional(),
  search: Joi.string().trim().max(60).optional(),
});

const paystackInitSchema = Joi.object({
  callbackUrl: Joi.string().uri().optional(),
});

const paystackVerifySchema = Joi.object({
  reference: Joi.string().trim().min(3).max(200).required(),
});

const setTrackingSchema = Joi.object({
  courier: Joi.string().trim().min(2).max(120).required(),
  trackingNumber: Joi.string().trim().min(2).max(120).required(),
  trackingUrl: Joi.string().trim().uri().max(2048).allow("").optional(),
});

const dispatchOrderSchema = setTrackingSchema.keys({
  note: Joi.string().trim().max(300).allow("").optional(),
});

const confirmDeliverySchema = Joi.object({
  satisfied: Joi.boolean().required(),
  feedback: Joi.string().trim().max(2000).allow("").optional(),
});

const adminCancelPaidSchema = Joi.object({
  reason: Joi.string().trim().max(2000).allow("").optional(),
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
  paystackInitSchema,
  paystackVerifySchema,
  setTrackingSchema,
  dispatchOrderSchema,
  confirmDeliverySchema,
  adminCancelPaidSchema,
};
