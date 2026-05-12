const mongoose = require("mongoose");

const mediaAssetSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true },
    originalName: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 },
    kind: { type: String, enum: ["image", "video", "document", "other"], default: "other" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("MediaAsset", mediaAssetSchema);
