require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { connectDatabase } = require("./config/db");
const PageContent = require("./models/PageContent");

const UPLOAD_DIR = path.join(__dirname, "../uploads");
const PAGES_DIR = path.join(UPLOAD_DIR, "pages");
const PUBLIC_BASE = (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/+$/, "");

const args = new Set(process.argv.slice(2));
const DRY_RUN = !args.has("--apply");
const VERBOSE = args.has("--verbose");

const stats = {
  pagesProcessed: 0,
  pagesUpdated: 0,
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

function pageFolderPrefix(pageKey) {
  return `pages/${pageKey}/`;
}

function shouldRecurse(value) {
  if (!value || typeof value !== "object") return false;
  if (value instanceof Date) return false;
  return true;
}

function collectUrlsFromValue(value, urls) {
  if (typeof value === "string") {
    if (isLocalUploadsUrl(value)) urls.push(value);
    else if (value.includes("res.cloudinary.com")) stats.skippedExternal++;
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrlsFromValue(item, urls);
    return;
  }
  if (shouldRecurse(value)) {
    for (const entry of Object.values(value)) collectUrlsFromValue(entry, urls);
  }
}

function collectUrlsFromPage(page) {
  const urls = [];
  for (const section of page.sections || []) {
    for (const block of section.blocks || []) {
      collectUrlsFromValue(block.value, urls);
    }
  }
  return urls;
}

function buildRefCounts(pages) {
  const counts = new Map();
  for (const page of pages) {
    const seen = new Set();
    for (const url of collectUrlsFromPage(page)) {
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

function resolveNewUrl(oldUrl, pageKey, refCounts, cache) {
  if (!isLocalUploadsUrl(oldUrl)) return oldUrl;
  if (cache.has(oldUrl)) return cache.get(oldUrl);

  const rel = extractUploadsRelativePath(oldUrl);
  if (!rel) return oldUrl;

  const prefix = pageFolderPrefix(pageKey);
  if (rel.startsWith(prefix)) {
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

  const destDir = path.join(PAGES_DIR, pageKey);
  const { filename, destPath } = pickDestFilename(destDir, srcPath);
  const newRel = `${prefix}${filename}`;
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

function transformValue(value, pageKey, refCounts, cache) {
  if (typeof value === "string") {
    return isLocalUploadsUrl(value) ? resolveNewUrl(value, pageKey, refCounts, cache) : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => transformValue(item, pageKey, refCounts, cache));
  }
  if (shouldRecurse(value)) {
    const next = {};
    for (const [k, v] of Object.entries(value)) {
      next[k] = transformValue(v, pageKey, refCounts, cache);
    }
    return next;
  }
  return value;
}

function transformPage(page, refCounts) {
  const pageKey = page.pageKey;
  const cache = new Map();
  const next = page.toObject();

  next.sections = (next.sections || []).map((section) => ({
    ...section,
    blocks: (section.blocks || []).map((block) => ({
      ...block,
      value: transformValue(block.value, pageKey, refCounts, cache),
    })),
  }));

  return next;
}

function stableStringify(value) {
  return JSON.stringify(value);
}

async function run() {

  await connectDatabase();

  const pages = await PageContent.find({});

  const refCounts = buildRefCounts(pages);

  for (const page of pages) {
    stats.pagesProcessed++;
    const before = stableStringify(page.toObject());
    const afterObj = transformPage(page, refCounts);
    const after = stableStringify(afterObj);

    if (before === after) continue;

    stats.pagesUpdated++;

    if (DRY_RUN) {
      continue;
    }

    await PageContent.replaceOne({ _id: page._id }, afterObj);
  }

  const legacyDir = path.join(UPLOAD_DIR, "cevik-emlak");
  if (!DRY_RUN && fs.existsSync(legacyDir)) {
    const remaining = fs.readdirSync(legacyDir).filter((f) => {
      const full = path.join(legacyDir, f);
      return fs.statSync(full).isFile();
    });
    if (remaining.length === 0 && fs.readdirSync(legacyDir).length === 0) {
      fs.rmdirSync(legacyDir);
    } else if (remaining.length > 0) {
    }
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
