const mongoose = require("mongoose");

/** Per-admin read state for AdminNotification inbox. */
const adminNotificationReadSchema = new mongoose.Schema(
  {
    notification: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminNotification",
      required: true,
      index: true,
    },
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    readAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

adminNotificationReadSchema.index({ notification: 1, admin: 1 }, { unique: true });
adminNotificationReadSchema.index({ admin: 1, readAt: -1 });

module.exports = mongoose.model("AdminNotificationRead", adminNotificationReadSchema);
