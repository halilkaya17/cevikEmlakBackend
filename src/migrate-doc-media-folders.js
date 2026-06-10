require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { connectDatabase } = require("./config/db");
const DocFile = require("./models/DocFile");

const UPLOAD_DIR = path.join(__dirname, "../uploads");
const DOCS_DIR = path.join(UPLOAD_DIR, "docs");
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

function docFolderPrefix(docId) {
  return `docs/${docId}/`;
}

function collectUrlsFromDoc(doc) {
  const urls = [];
  const url = doc.url;
  if (isLocalUploadsUrl(url)) urls.push(url);
  else if (url && url.includes("res.cloudinary.com")) stats.skippedExternal++;
  return urls;
}

function buildRefCounts(docs) {
  const counts = new Map();
  for (const doc of docs) {
    for (const url of collectUrlsFromDoc(doc)) {
      const rel = extractUploadsRelativePath(url);
      if (!rel) continue;
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

function resolveNewUrl(oldUrl, docId, refCounts, cache) {
  if (!isLocalUploadsUrl(oldUrl)) return oldUrl;
  if (cache.has(oldUrl)) return cache.get(oldUrl);

  const rel = extractUploadsRelativePath(oldUrl);
  if (!rel) return oldUrl;

  const prefix = docFolderPrefix(docId);
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

  const destDir = path.join(DOCS_DIR, docId);
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

function transformDoc(doc, refCounts) {
  const docId = String(doc._id);
  const cache = new Map();
  const next = doc.toObject();

  if (next.url) {
    next.url = resolveNewUrl(next.url, docId, refCounts, cache);
  }

  return next;
}

function stableStringify(value) {
  return JSON.stringify(value);
}

async function run() {

  await connectDatabase();

  const docs = await DocFile.find({});

  const refCounts = buildRefCounts(docs);

  for (const doc of docs) {
    stats.docsProcessed++;
    const before = stableStringify(doc.toObject());
    const afterObj = transformDoc(doc, refCounts);
    const after = stableStringify(afterObj);

    if (before === after) continue;

    stats.docsUpdated++;

    const label = doc.name || doc.originalName || doc._id;
    if (DRY_RUN) {
      continue;
    }

    await DocFile.replaceOne({ _id: doc._id }, afterObj);
  }

  const legacyDir = path.join(UPLOAD_DIR, "cevik-emlak", "docs");
  if (!DRY_RUN && fs.existsSync(legacyDir)) {
    const remaining = fs.readdirSync(legacyDir);
    if (remaining.length === 0) {
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
