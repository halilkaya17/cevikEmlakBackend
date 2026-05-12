const mongoose = require("mongoose");

const docFileSchema = new mongoose.Schema(
  {
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "DocCategory", required: true, index: true },
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true },
    originalName: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 },
    cloudinaryId: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("DocFile", docFileSchema);
