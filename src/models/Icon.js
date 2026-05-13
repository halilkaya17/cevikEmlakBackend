const mongoose = require("mongoose");

const iconSchema = new mongoose.Schema(
  {
    key:           { type: String, required: true, unique: true, trim: true },
    label:         { type: String, required: true, trim: true },
    paths:         [{ type: String }],
    stroke:        { type: Boolean, default: true },
    viewBox:       { type: String, default: null },
    fillRule:      { type: String, default: null },
    rawSvgContent: { type: String, default: null },
  },
  { timestamps: true },
);

iconSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model("Icon", iconSchema);
