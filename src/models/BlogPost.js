const mongoose = require("mongoose");

const sectoralCommentSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    authorName: { type: String, default: "" },
    description: { type: String, default: "" },
  },
  { _id: false },
);

const blogPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    excerpt: { type: String, default: "" },
    content: { type: String, default: "" },
    descriptionHtml: { type: String, default: "" },
    coverImage: { type: String, default: "" },
    gallery: [{ type: String }],
    sectoralComment: { type: sectoralCommentSchema, default: () => ({}) },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model("BlogPost", blogPostSchema);
