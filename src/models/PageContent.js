const mongoose = require("mongoose");

const blockSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: ["text", "textarea", "number", "boolean", "image", "media", "video", "json", "stat-list", "string-list", "metric-list", "accordion-list", "location-list", "blog-featured-list", "blog-side-list", "featured-project-list", "slider-list", "timeline-list", "social-list"],
      default: "text",
    },
    value: { type: mongoose.Schema.Types.Mixed, default: "" },
  },
  { _id: false },
);

const sectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    blocks: [blockSchema],
  },
  { _id: false },
);

const pageContentSchema = new mongoose.Schema(
  {
    pageKey: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    sections: [sectionSchema],
  },
  { timestamps: true },
);

module.exports = mongoose.model("PageContent", pageContentSchema);
