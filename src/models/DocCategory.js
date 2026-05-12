const mongoose = require("mongoose");

const docCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model("DocCategory", docCategorySchema);
