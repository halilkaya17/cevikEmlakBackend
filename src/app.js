require("dotenv").config();

const fs = require("fs");
const path = require("path");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();

const uploadDir = path.join(__dirname, "../uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const adminDir = path.join(__dirname, "../../admin");

const origins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://*.amazonaws.com"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
      },
    },
  }),
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origins.length === 0 || origins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(rateLimit({ windowMs: 60 * 1000, max: 300 }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadDir));

// Admin paneli: statik HTML/JS uygulama ( /yonetim )
app.use(
  "/yonetim",
  express.static(adminDir, {
    index: "index.html",
    extensions: ["html"],
    fallthrough: true,
  }),
);
app.get(["/yonetim", "/yonetim/", "/yonetim/*"], (_req, res) => {
  res.sendFile(path.join(adminDir, "index.html"));
});

// Login sayfasi icin kisa yol
app.get("/giris", (_req, res) => {
  res.sendFile(path.join(adminDir, "login.html"));
});

const API_PREFIX = "/api/v1";

app.get(`${API_PREFIX}/health`, (_req, res) => {
  res.json({ ok: true, service: "cevik-emlak-backend" });
});

app.use(`${API_PREFIX}/auth`, require("./routes/auth"));
app.use(`${API_PREFIX}/dashboard`, require("./routes/dashboard"));
app.use(`${API_PREFIX}/categories`, require("./routes/categories"));
app.use(`${API_PREFIX}/agents`, require("./routes/agents"));
app.use(`${API_PREFIX}/listings`, require("./routes/listings"));
app.use(`${API_PREFIX}/blog`, require("./routes/blog"));
app.use(`${API_PREFIX}/media`, require("./routes/media"));
app.use(`${API_PREFIX}/pages`, require("./routes/pages"));
app.use(`${API_PREFIX}/sss`, require("./routes/sss"));
app.use(`${API_PREFIX}/contact-page`, require("./routes/contactPage"));
app.use(`${API_PREFIX}/cloudinary`, require("./routes/cloudinary"));
app.use(`${API_PREFIX}/admin-users`, require("./routes/adminUsers"));
app.use(`${API_PREFIX}/docs`, require("./routes/docs"));

app.use((req, res) => {
  res.status(404).json({ message: `${req.method} ${req.originalUrl} bulunamadi` });
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  const message = error.code === 11000 ? "Bu kayit zaten var" : error.message || "Sunucu hatasi";
  res.status(status).json({ message });
});

module.exports = app;
