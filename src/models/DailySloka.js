const mongoose = require("mongoose");

const dailySlokaSchema = new mongoose.Schema(
  {
    sloka: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
    },
    dateKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

dailySlokaSchema.index({ dateKey: 1 }, { unique: true });

module.exports = mongoose.model("DailySloka", dailySlokaSchema);
