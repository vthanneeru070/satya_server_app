const mongoose = require("mongoose");

/**
 * Atomic sequence generator for human-readable order numbers (SATYA-10001).
 * Uses findOneAndUpdate with upsert so concurrent checkouts never collide.
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 10000 },
  },
  { collection: "counters" }
);

module.exports = mongoose.model("Counter", counterSchema);
