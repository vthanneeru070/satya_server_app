const mongoose = require("mongoose");

const dailySlokaSchema = new mongoose.Schema(
  {
    sloka: {
      type: String,
      required: true,
      trim: true,
    },
    author:{
      type: String,
      required: false,
      trim: true,
    },
    meaning: {
      type: String,
      required: false,
      trim: true,
    },
    contemplation:{
      type: String,
      required: false,
      trim: true,
    },
    prayer:{
      type: String,
      required: false,
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

module.exports = mongoose.model("DailySloka", dailySlokaSchema);
