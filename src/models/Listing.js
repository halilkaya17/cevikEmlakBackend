const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: "" },
    type: { type: String, enum: ["image", "video"], default: "image" },
    alt: { type: String, default: "" },
    isCover: { type: Boolean, default: false },
  },
  { _id: false },
);

const documentSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    url: { type: String, required: true },
    publicId: { type: String, default: "" },
    format: { type: String, default: "" },
  },
  { _id: false },
);

const floorPlanImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: "" },
  },
  { _id: false },
);

const floorPlanSchema = new mongoose.Schema(
  {
    type: { type: String, default: "" },
    images: [floorPlanImageSchema],
  },
  { _id: false },
);

const contentGalleryItemSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: "" },
    caption: { type: String, default: "" },
  },
  { _id: false },
);

const listingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    listingNo: { type: String, required: true, unique: true },
    transactionType: { type: String, enum: ["satilik", "kiralik"], required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    categorySlug: { type: String, required: true },
    subcategory: { type: String, default: "" },
    status: { type: String, enum: ["draft", "published", "archived"], default: "draft" },
    badges: [{ text: String, variant: { type: String, default: "kiralik" } }],
    price: { type: Number, default: 0 },
    currency: { type: String, default: "TRY" },
    city: { type: String, default: "" },
    district: { type: String, default: "" },
    neighborhood: { type: String, default: "" },
    address: { type: String, default: "" },
    locationText: { type: String, default: "" },
    coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    areaGross: { type: Number, default: null },
    areaNet: { type: Number, default: null },
    rooms: { type: String, default: "" },
    salons: { type: String, default: "" },
    bathrooms: { type: String, default: "" },
    summary: { type: String, default: "" },
    description: { type: String, default: "" },
    highlights: [{ type: String }],
    propertyValues: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    images: [imageSchema],
    documents: [documentSchema],
    floorPlans: [floorPlanSchema],
    contentGallery: [contentGalleryItemSchema],
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "Agent" },
    viewCount: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

listingSchema.index({ title: "text", city: "text", district: "text", summary: "text" });

module.exports = mongoose.model("Listing", listingSchema);
