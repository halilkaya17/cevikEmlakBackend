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
    /** Eski kayıtlar; yeni içerik descriptionHtml ile tutulur */
    content: { type: String, default: "" },
    /** Ana metin (rich HTML) */
    descriptionHtml: { type: String, default: "" },
    coverImage: { type: String, default: "" },
    /** İçerik galerisi — birden fazla görsel URL */
    gallery: [{ type: String }],
    /** Sektörel yorum — tamamı opsiyonel */
    sectoralComment: { type: sectoralCommentSchema, default: () => ({}) },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model("BlogPost", blogPostSchema);
