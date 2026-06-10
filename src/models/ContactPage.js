const mongoose = require("mongoose");

const socialLinkSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    platform: { type: String, default: "facebook" },
    url: { type: String, default: "" },
  },
  { _id: false },
);

const contactPageSchema = new mongoose.Schema(
  {
    headline: { type: String, default: "" },
    subheadline: { type: String, default: "" },
    phone: { type: String, default: "" },
    fax: { type: String, default: "" },
    email: { type: String, default: "" },
    address: { type: String, default: "" },
    mapUrl: { type: String, default: "" },
    social: [socialLinkSchema],
  },
  { timestamps: true },
);

module.exports = mongoose.model("ContactPage", contactPageSchema);
