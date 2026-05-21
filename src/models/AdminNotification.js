const mongoose = require("mongoose");
const { ADMIN_NOTIFICATION_TYPES } = require("../constants/adminNotificationTypes");

const TYPE_VALUES = Object.values(ADMIN_NOTIFICATION_TYPES);

/**
 * System notification for admin / superadmin (orders, donations, refund requests).
 * One document per event; deduped by sourceKey. Read state is per-admin (AdminNotificationRead).
 */
const adminNotificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: TYPE_VALUES,
      required: true,
      index: true,
    },
    /** Idempotent key, e.g. order:abc:NEW_ORDER */
    sourceKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: "", trim: true, maxlength: 1000 },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

adminNotificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AdminNotification", adminNotificationSchema);
