const mongoose = require("mongoose");

/**
 * Tracks a user's pooja performance — one row per attempt.
 * At most one PENDING (in progress) session per user + pooja at a time.
 */
const userPoojaSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    pooja: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pooja",
      required: true,
      index: true,
    },
    scheduleId: {
      type: String,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "FINISHED"],
      default: "PENDING",
      index: true,
    },
    /** Last completed step number (1-based); 0 = just started. */
    currentStep: {
      type: Number,
      min: 0,
      default: 0,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    finishedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

userPoojaSessionSchema.index({ user: 1, status: 1, updatedAt: -1 });
userPoojaSessionSchema.index(
  { user: 1, pooja: 1, scheduleId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "PENDING", isDeleted: { $ne: true } },
  }
);

module.exports = mongoose.model("UserPoojaSession", userPoojaSessionSchema);
