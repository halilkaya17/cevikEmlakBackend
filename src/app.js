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

function normalizeOriginUrl(value) {
  if (!value || typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "");
}

const rawClientOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((item) => normalizeOriginUrl(item))
  .filter(Boolean);

function truthyEnv(value) {
  return value === "1" || value === "true" || value === "yes" || value === "TRUE";
}

function falsyEnv(value) {
  return value === "0" || value === "false" || value === "no" || value === "FALSE";
}

/** Tüm origin’lere izin (credentials ile birlikte: gelen Origin yansıtılır). Render’da acil çözüm için CORS_ALLOW_ALL=true */
const corsAllowAll =
  truthyEnv(process.env.CORS_ALLOW_ALL) ||
  rawClientOrigins.some((o) => o === "*" || /^all$/i.test(o));

/** Vercel preview (*.vercel.app): açık flag veya CLIENT_ORIGIN içinde zaten bir vercel.app adresi varsa */
function vercelWildcardAllowed() {
  if (truthyEnv(process.env.CLIENT_ORIGIN_ALLOW_VERCEL)) return true;
  if (falsyEnv(process.env.CLIENT_ORIGIN_ALLOW_VERCEL)) return false;
  return rawClientOrigins.some((o) => /\.vercel\.app$/i.test(o));
}

const vercelOriginRegex = /^https:\/\/.+\.vercel\.app$/i;

/** CORS + 404 + hata cevaplarında aynı kural */
function isRequestOriginAllowed(originHeader) {
  if (!originHeader) return true;
  if (corsAllowAll) return true;
  const o = normalizeOriginUrl(originHeader);
  if (!rawClientOrigins.length) return true;
  const listed = rawClientOrigins.filter((x) => x !== "*" && !/^all$/i.test(x));
  if (!listed.length) return true;
  if (listed.includes(o)) return true;
  if (vercelWildcardAllowed() && vercelOriginRegex.test(o)) return true;
  return false;
}

/** cors paketine verilecek origin — Error callback kullanılmaz */
function buildCorsOriginOption() {
  if (corsAllowAll) return true;
  if (!rawClientOrigins.length) return true;
  const list = rawClientOrigins.filter((o) => o !== "*" && !/^all$/i.test(o));
  if (!list.length) return true;
  if (vercelWildcardAllowed()) {
    list.push(vercelOriginRegex);
  }
  return list;
}

function applyCorsHeadersIfAllowed(req, res) {
  const origin = req.headers.origin;
  if (!origin || !isRequestOriginAllowed(origin) || res.getHeader("Access-Control-Allow-Origin")) return;
  res.setHeader("Access-Control-Allow-Origin", normalizeOriginUrl(origin));
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.append("Vary", "Origin");
}

app.use(
  cors({
    origin: buildCorsOriginOption(),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    optionsSuccessStatus: 204,
  }),
);

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
app.use(`${API_PREFIX}/icons`, require("./routes/icons"));
app.use(`${API_PREFIX}/search-request`, require("./routes/searchRequest"));

app.use((req, res) => {
  applyCorsHeadersIfAllowed(req, res);
  res.status(404).json({ message: `${req.method} ${req.originalUrl} bulunamadi` });
});

app.use((error, req, res, _next) => {
  if (!res.headersSent) {
    applyCorsHeadersIfAllowed(req, res);
  }
  const status = error.status || 500;
  const message = error.code === 11000 ? "Bu kayit zaten var" : error.message || "Sunucu hatasi";
  res.status(status).json({ message });
});

module.exports = app;
