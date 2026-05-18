const mongoose = require("mongoose");

const listingSnapshotSchema = new mongoose.Schema(
  {
    id: { type: String, default: "" },
    listingNo: { type: String, default: "" },
    title: { type: String, default: "" },
    slug: { type: String, default: "" },
  },
  { _id: false },
);

const inboxMessageSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["listing_inquiry", "contact"],
      required: true,
    },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", default: null },
    listingSnapshot: { type: listingSnapshotSchema, default: null },
    subject: { type: String, default: "", trim: true },
    body: { type: String, default: "", trim: true },
    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "messages" },
);

inboxMessageSchema.index({ read: 1, createdAt: -1 });
inboxMessageSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model("InboxMessage", inboxMessageSchema);
