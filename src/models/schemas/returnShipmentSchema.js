const mongoose = require("mongoose");

/** Shared return logistics for refund / replacement requests. */
const returnShipmentSchema = new mongoose.Schema(
  {
    method: {
      type: String,
      enum: ["COURIER_COLLECTION", "WAREHOUSE_DROP_OFF"],
      default: "WAREHOUSE_DROP_OFF",
    },
    status: {
      type: String,
      enum: [
        "NOT_APPLICABLE",
        "AWAITING_RETURN",
        "RETURN_BOOKED",
        "RETURN_IN_TRANSIT",
        "RETURN_RECEIVED",
      ],
      default: "NOT_APPLICABLE",
      index: true,
    },
    instructions: { type: String, default: "", trim: true, maxlength: 2000 },
    provider: { type: String, default: "" },
    shipmentId: { type: String, default: "" },
    waybill: { type: String, default: "" },
    shortTrackingReference: { type: String, default: "" },
    trackingUrl: { type: String, default: "" },
    labelUrl: { type: String, default: "" },
    courierStatus: { type: String, default: "" },
    bookedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { _id: false }
);

module.exports = { returnShipmentSchema };
