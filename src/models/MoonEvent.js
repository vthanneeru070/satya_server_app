const mongoose = require("mongoose");

const moonEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["NEW_MOON", "FULL_MOON"],
      required: true,
    },
    eventTimeUtc: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

moonEventSchema.index({ eventTimeUtc: 1 });

module.exports = mongoose.model("MoonEvent", moonEventSchema);
