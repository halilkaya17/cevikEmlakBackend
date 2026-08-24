const express = require("express");
const bcrypt = require("bcryptjs");
const AdminUser = require("../models/AdminUser");
const { requireAuth, signAdmin } = require("../middleware/auth");

const router = express.Router();

function publicUser(admin) {
  return {
    id: admin._id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    phone: admin.phone || "",
    eids: admin.eids || "",
  };
}

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const admin = await AdminUser.findOne({ email: String(email || "").toLowerCase() });
    if (!admin) return res.status(401).json({ message: "E-posta veya sifre hatali" });

    const ok = await bcrypt.compare(password || "", admin.passwordHash);
    if (!ok) return res.status(401).json({ message: "E-posta veya sifre hatali" });

    return res.json({
      token: signAdmin(admin),
      user: publicUser(admin),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const admin = await AdminUser.findById(req.user.sub).select("-passwordHash");
    if (!admin) return res.status(401).json({ message: "Kullanıcı bulunamadı" });
    return res.json({ user: publicUser(admin) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
