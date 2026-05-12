const express = require("express");
const bcrypt = require("bcryptjs");
const AdminUser = require("../models/AdminUser");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/* Tüm route'lar auth gerektirir */
router.use(requireAuth);

/* ─── Listele ─── */
router.get("/", async (_req, res, next) => {
  try {
    const users = await AdminUser.find().select("-passwordHash").sort({ createdAt: 1 });
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

/* ─── Oluştur ─── */
router.post("/", async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "E-posta ve şifre zorunludur" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Şifre en az 6 karakter olmalıdır" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await AdminUser.create({
      name: name || "Admin",
      email: String(email).toLowerCase().trim(),
      passwordHash,
      role: role || "admin",
    });
    return res.status(201).json({
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt },
    });
  } catch (error) {
    return next(error);
  }
});

/* ─── Güncelle ─── */
router.put("/:id", async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (email !== undefined) update.email = String(email).toLowerCase().trim();
    if (role !== undefined) update.role = role;
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ message: "Şifre en az 6 karakter olmalıdır" });
      }
      update.passwordHash = await bcrypt.hash(password, 10);
    }
    const user = await AdminUser.findByIdAndUpdate(req.params.id, update, { new: true }).select("-passwordHash");
    if (!user) return res.status(404).json({ message: "Kullanıcı bulunamadı" });
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

/* ─── Sil ─── */
router.delete("/:id", async (req, res, next) => {
  try {
    /* Kendini silemesin */
    if (String(req.user?.id) === String(req.params.id)) {
      return res.status(400).json({ message: "Kendi hesabınızı silemezsiniz" });
    }
    const user = await AdminUser.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "Kullanıcı bulunamadı" });
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
