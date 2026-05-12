const mongoose = require("mongoose");

const listingViewSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
    fingerprint: { type: String, required: true },
  },
  { timestamps: true },
);

listingViewSchema.index({ listing: 1, fingerprint: 1 }, { unique: true });

module.exports = mongoose.model("ListingView", listingViewSchema);
