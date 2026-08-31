const mongoose = require("mongoose");

const completedDaySchema = new mongoose.Schema(
  {
    dayNumber: { type: Number, required: true, min: 1 },
    completedAt: { type: Date, required: true },
    dateKey: { type: String, required: true, trim: true },
  },
  { _id: false }
);

/**
 * Tracks a user's multi-day ritual progress — one row per attempt.
 * At most one PENDING session per user + ritual at a time.
 */
const userRitualSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    ritual: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ritual",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "FINISHED", "ABANDONED"],
      default: "PENDING",
      index: true,
    },
    abandonReason: {
      type: String,
      default: null,
    },
    attemptNumber: {
      type: Number,
      min: 1,
      default: 1,
    },
    /** Day currently in progress (1-based). */
    currentDay: {
      type: Number,
      min: 1,
      default: 1,
    },
    /** Last completed step within the current day (0 = day started, no steps done). */
    currentStep: {
      type: Number,
      min: 0,
      default: 0,
    },
    completedDays: {
      type: [completedDaySchema],
      default: [],
    },
    /** Calendar date (YYYY-MM-DD) when the user last completed a ritual day. */
    lastCompletedDayDateKey: {
      type: String,
      default: null,
    },
    currentDayStartedAt: {
      type: Date,
      default: null,
    },
    currentDayStartedDateKey: {
      type: String,
      default: null,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
    finishedAt: {
      type: Date,
      default: null,
    },
    abandonedAt: {
      type: Date,
      default: null,
    },
    /** Scheduled push/inbox for next day's required items (multi-day rituals). */
    nextDayReminderAt: {
      type: Date,
      default: null,
      index: true,
    },
    nextDayReminderDayNumber: {
      type: Number,
      default: null,
    },
    nextDayReminderSent: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

userRitualSessionSchema.index({ user: 1, status: 1, updatedAt: -1 });
userRitualSessionSchema.index(
  { user: 1, ritual: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "PENDING", isDeleted: { $ne: true } },
  }
);
userRitualSessionSchema.index({
  status: 1,
  nextDayReminderSent: 1,
  nextDayReminderAt: 1,
});

module.exports = mongoose.model("UserRitualSession", userRitualSessionSchema);
