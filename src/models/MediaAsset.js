const mongoose = require("mongoose");

const mediaAssetSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true },
    originalName: { type: String, required: true },
    url: { type: String, required: true },
    relativePath: { type: String, default: "" },
    cloudinaryId: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 },
    kind: { type: String, enum: ["image", "video", "document", "other"], default: "other" },
    scope: { type: String, default: "library" },
    entityId: { type: String, default: "" },
    pageKey: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("MediaAsset", mediaAssetSchema);
