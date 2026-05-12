const jwt = require("jsonwebtoken");

function signAdmin(admin) {
  return jwt.sign(
    { sub: admin._id.toString(), email: admin.email, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({ message: "Yetkisiz istek" });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Oturum gecersiz veya suresi dolmus" });
  }
}

module.exports = { requireAuth, signAdmin };
