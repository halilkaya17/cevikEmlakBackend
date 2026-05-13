const mongoose = require("mongoose");

const optionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    value: { type: String, required: true },
    icon: { type: String, default: "" },
  },
  { _id: false },
);

const propertyFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: ["text", "number", "select", "multiselect", "boolean", "textarea"],
      default: "text",
    },
    unit: { type: String, default: "" },
    icon: { type: String, default: "" },
    options: [optionSchema],
    required: { type: Boolean, default: false },
    showOnCard: { type: Boolean, default: false },
    quickView: { type: Boolean, default: false },
  },
  { _id: false },
);

const propertyGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    key: { type: String, required: true },
    appliesTo: [{ type: String }],
    fields: [propertyFieldSchema],
  },
  { _id: false },
);

const subcategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true },
    propertyGroups: [propertyGroupSchema],
  },
  { _id: false },
);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    svg: { type: String, default: "" },
    saleTypes: [{ type: String, enum: ["satilik", "kiralik"] }],
    subcategories: [subcategorySchema],
    propertyGroups: [propertyGroupSchema],
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Category", categorySchema);
