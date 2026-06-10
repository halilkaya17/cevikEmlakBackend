require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { connectDatabase } = require("./config/db");
const SssContent = require("./models/SssContent");

const UPLOAD_DIR = path.join(__dirname, "../uploads");
const SSS_BANNER_DIR = path.join(UPLOAD_DIR, "sss", "banner");
const BANNER_PREFIX = "sss/banner/";
const PUBLIC_BASE = (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/+$/, "");

const args = new Set(process.argv.slice(2));
const DRY_RUN = !args.has("--apply");
const VERBOSE = args.has("--verbose");

const stats = {
  docsProcessed: 0,
  docsUpdated: 0,
  filesMoved: 0,
  filesCopied: 0,
  urlsUpdated: 0,
  alreadyInPlace: 0,
  missingFile: 0,
  skippedExternal: 0,
};

function normalizePathKey(relativePath) {
  return String(relativePath || "")
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/")
    .normalize("NFC");
}

function extractUploadsRelativePath(value) {
  if (typeof value !== "string" || !value.includes("/uploads/")) return null;
  const match = value.match(/\/uploads\/([^?#]+)/i);
  if (!match) return null;
  return normalizePathKey(match[1].replace(/\\/g, "/"));
}

function isLocalUploadsUrl(url) {
  return typeof url === "string" && url.includes("/uploads/") && !url.includes("res.cloudinary.com");
}

function publicUrlForRelative(relativePath) {
  return `${PUBLIC_BASE}/uploads/${relativePath.split("/").join("/")}`;
}

function absolutePathForRelative(relativePath) {
  return path.join(UPLOAD_DIR, relativePath.split("/").join(path.sep));
}

function collectBannerUrls(doc) {
  const urls = [];
  const banner = doc.banner || {};
  for (const key of ["backgroundImage", "image1", "image2"]) {
    const url = banner[key];
    if (isLocalUploadsUrl(url)) urls.push(url);
    else if (url && url.includes("res.cloudinary.com")) stats.skippedExternal++;
  }
  return urls;
}

function buildRefCounts(docs) {
  const counts = new Map();
  for (const doc of docs) {
    const seen = new Set();
    for (const url of collectBannerUrls(doc)) {
      const rel = extractUploadsRelativePath(url);
      if (!rel || seen.has(rel)) continue;
      seen.add(rel);
      counts.set(rel, (counts.get(rel) || 0) + 1);
    }
  }
  return counts;
}

function pickDestFilename(destDir, srcPath) {
  let filename = path.basename(srcPath);
  let destPath = path.join(destDir, filename);
  if (!fs.existsSync(destPath)) return { filename, destPath };

  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let n = 1;
  while (fs.existsSync(destPath)) {
    filename = `${base}_${n}${ext}`;
    destPath = path.join(destDir, filename);
    n++;
  }
  return { filename, destPath };
}

function transferFile(srcPath, destPath, copy) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  if (copy) {
    fs.copyFileSync(srcPath, destPath);
    stats.filesCopied++;
  } else {
    fs.renameSync(srcPath, destPath);
    stats.filesMoved++;
  }
}

function resolveNewUrl(oldUrl, refCounts, cache) {
  if (!isLocalUploadsUrl(oldUrl)) return oldUrl;
  if (cache.has(oldUrl)) return cache.get(oldUrl);

  const rel = extractUploadsRelativePath(oldUrl);
  if (!rel) return oldUrl;

  if (rel.startsWith(BANNER_PREFIX)) {
    stats.alreadyInPlace++;
    cache.set(oldUrl, oldUrl);
    return oldUrl;
  }

  const srcPath = absolutePathForRelative(rel);
  if (!fs.existsSync(srcPath)) {
    stats.missingFile++;
    cache.set(oldUrl, oldUrl);
    return oldUrl;
  }

  const { filename, destPath } = pickDestFilename(SSS_BANNER_DIR, srcPath);
  const newRel = `${BANNER_PREFIX}${filename}`;
  const newUrl = publicUrlForRelative(newRel);
  const copy = (refCounts.get(rel) || 0) > 1;

  if (DRY_RUN) {
  } else if (!fs.existsSync(destPath)) {
    transferFile(srcPath, destPath, copy);
  }

  cache.set(oldUrl, newUrl);
  if (newUrl !== oldUrl) stats.urlsUpdated++;
  return newUrl;
}

function transformDoc(doc, refCounts) {
  const cache = new Map();
  const next = doc.toObject();
  next.banner = next.banner || {};

  for (const key of ["backgroundImage", "image1", "image2"]) {
    if (next.banner[key]) {
      next.banner[key] = resolveNewUrl(next.banner[key], refCounts, cache);
    }
  }

  return next;
}

function stableStringify(value) {
  return JSON.stringify(value);
}

async function run() {

  await connectDatabase();

  const docs = await SssContent.find({});

  const refCounts = buildRefCounts(docs);

  for (const doc of docs) {
    stats.docsProcessed++;
    const before = stableStringify(doc.toObject());
    const afterObj = transformDoc(doc, refCounts);
    const after = stableStringify(afterObj);

    if (before === after) continue;

    stats.docsUpdated++;

    if (DRY_RUN) {
      continue;
    }

    await SssContent.replaceOne({ _id: doc._id }, afterObj);
  }

  if (DRY_RUN) {
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  try {
    await mongoose.disconnect();
  } catch {
  }
  process.exit(1);
});
