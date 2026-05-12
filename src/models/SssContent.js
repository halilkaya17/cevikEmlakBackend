const mongoose = require("mongoose");

const faqSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    question: { type: String, default: "" },
    answer: { type: String, default: "" },
    tag: { type: String, default: "" },
  },
  { _id: false },
);

const subSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, default: "" },
    faqs: [faqSchema],
  },
  { _id: false },
);

const categorySchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, default: "" },
    subs: [subSchema],
  },
  { _id: false },
);

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    /** Tam genişlik hero arka planı (URL veya /public yolu) */
    backgroundImage: { type: String, default: "" },
    image1: { type: String, default: "" },
    image2: { type: String, default: "" },
  },
  { _id: false },
);

const sssContentSchema = new mongoose.Schema(
  {
    banner: { type: bannerSchema, default: () => ({}) },
    categories: [categorySchema],
  },
  { timestamps: true },
);

module.exports = mongoose.model("SssContent", sssContentSchema);
