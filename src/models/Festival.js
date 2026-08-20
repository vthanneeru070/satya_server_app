const mongoose = require("mongoose");

const festivalSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    date: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
    },
    image: {
      type: String,
      required: false,
    },
    associate_pujas: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Pooja",
      },
    ],
    category: {
      type: String,
      enum: ["MAJOR", "MINOR", "FASTING", "ECLIPSE"],
      default: "MAJOR",
    },
    isGlobal: {
      type: Boolean,
      default: true,
    },
    location: {
      country: String,
      state: String,
      city: String,
    },
    notifyUsers: {
      type: Boolean,
      default: true,
    },
    notificationDaysBefore: {
      type: Number,
      default: 1,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    status: {
      type: String,
      enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED"],
      default: "PENDING",
    },
    isVisible: {
      type: Boolean,
      default: false,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Legacy festivals may still store linked pujas under `rituals`.
festivalSchema.post("init", function (doc) {
  const legacy = doc._doc?.rituals;
  if (
    (!doc.associate_pujas || doc.associate_pujas.length === 0) &&
    Array.isArray(legacy) &&
    legacy.length > 0
  ) {
    doc.associate_pujas = legacy;
  }
});

festivalSchema.pre("save", function (next) {
  if (this.isModified("associate_pujas")) {
    this.set("rituals", undefined);
  }
  next();
});

module.exports = mongoose.model("Festival", festivalSchema);
