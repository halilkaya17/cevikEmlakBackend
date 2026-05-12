const express = require("express");
const bcrypt = require("bcryptjs");
const AdminUser = require("../models/AdminUser");
const { requireAuth, signAdmin } = require("../middleware/auth");

const router = express.Router();

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const admin = await AdminUser.findOne({ email: String(email || "").toLowerCase() });
    if (!admin) return res.status(401).json({ message: "E-posta veya sifre hatali" });

    const ok = await bcrypt.compare(password || "", admin.passwordHash);
    if (!ok) return res.status(401).json({ message: "E-posta veya sifre hatali" });

    return res.json({
      token: signAdmin(admin),
      user: { id: admin._id, email: admin.email, name: admin.name, role: admin.role },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
