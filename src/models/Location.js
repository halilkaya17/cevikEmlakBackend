const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema(
  {
    province_code: { type: Number, required: true },
    province_name: { type: String, required: true },
    district_code: { type: Number, required: true },
    district_name: { type: String, required: true },
    quarter_code:  { type: Number, required: true },
    quarter_name:  { type: String, required: true },
  },
  { collection: "locations", timestamps: false, versionKey: false },
);

locationSchema.index({ province_name: 1 });
locationSchema.index({ province_name: 1, district_name: 1 });

module.exports = mongoose.model("Location", locationSchema);
