const mongoose = require("mongoose");

const adminUserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, default: "Admin" },
    role: { type: String, default: "admin" },
    phone: { type: String, default: "", trim: true },
    /** GTB'den dönen kalıcı kullanıcı kodu (yetkiKodu değil) */
    eids: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("AdminUser", adminUserSchema);
