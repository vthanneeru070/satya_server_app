const mongoose = require("mongoose");

const warehouseSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    company: { type: String, default: "", trim: true },
    streetAddress: { type: String, default: "", trim: true },
    localArea: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    zone: { type: String, default: "", trim: true },
    postalCode: { type: String, default: "", trim: true },
    country: { type: String, default: "South Africa", trim: true },
    enteredAddress: { type: String, default: "", trim: true },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    contactName: { type: String, default: "", trim: true },
    contactPhone: { type: String, default: "", trim: true },
    contactEmail: { type: String, default: "", trim: true },
    hours: { type: String, default: "", trim: true },
    instructions: { type: String, default: "", trim: true },
    supportedCategories: {
      type: [String],
      default: [],
      set: (arr) =>
        (arr || []).map((c) => String(c || "").trim().toLowerCase()).filter(Boolean),
    },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

warehouseSchema.methods.toPickupLocationSnapshot = function toPickupLocationSnapshot() {
  return {
    company: this.company || "",
    streetAddress: this.streetAddress || "",
    localArea: this.localArea || "",
    city: this.city || "",
    zone: this.zone || "",
    postalCode: this.postalCode || "",
    country: this.country || "South Africa",
    enteredAddress: this.enteredAddress || "",
    contactName: this.contactName || "",
    contactPhone: this.contactPhone || "",
    contactEmail: this.contactEmail || "",
    hours: this.hours || "",
    instructions: this.instructions || "",
  };
};

module.exports = mongoose.model("Warehouse", warehouseSchema);
