const mongoose = require("mongoose");

const socialLinkSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    platform: { type: String, default: "facebook" },
    url: { type: String, default: "" },
  },
  { _id: false },
);

/** Tek doküman — İletişim sayfası içeriği */
const contactPageSchema = new mongoose.Schema(
  {
    headline: { type: String, default: "" },
    subheadline: { type: String, default: "" },
    phone: { type: String, default: "" },
    fax: { type: String, default: "" },
    email: { type: String, default: "" },
    address: { type: String, default: "" },
    mapLatitude: { type: Number, default: null },
    mapLongitude: { type: Number, default: null },
    mapZoom: { type: Number, default: 15 },
    social: [socialLinkSchema],
  },
  { timestamps: true },
);

module.exports = mongoose.model("ContactPage", contactPageSchema);
