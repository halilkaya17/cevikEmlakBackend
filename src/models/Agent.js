const mongoose = require("mongoose");

const agentSchema = new mongoose.Schema(
  {
    firstName: { type: String, default: "", trim: true },
    lastName:  { type: String, default: "", trim: true },
    /** Geriye-dönük uyumluluk — firstName + lastName yoksa name kullanılır */
    name:        { type: String, default: "", trim: true },
    title:       { type: String, default: "Gayrimenkul Danışmanı", trim: true },
    email:       { type: String, default: "", trim: true },
    mobilePhone: { type: String, default: "", trim: true },
    officePhone: { type: String, default: "", trim: true },
    /** Eski alan: geriye-dönük uyumluluk */
    phones:      [{ type: String, trim: true }],
    photo:       { type: String, default: "" },
    bio:         { type: String, default: "" },
    active:      { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** fullName: firstName + lastName varsa kullan, yoksa name alanına düş */
agentSchema.virtual("fullName").get(function () {
  const first = (this.firstName || "").trim();
  const last  = (this.lastName  || "").trim();
  if (first || last) return [first, last].filter(Boolean).join(" ");
  return this.name || "";
});

module.exports = mongoose.model("Agent", agentSchema);
