require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { connectDatabase } = require("./config/db");
const { optimizeUploadedFile, applyNewExtension } = require("./services/mediaOptimize");
const { extractUploadsRelativePath, normalizePathKey } = require("./utils/uploadPaths");
const { cleanupEmptyDirsFromRelativePath, UPLOAD_DIR } = require("./services/mediaStorage");

const Listing = require("./models/Listing");
const MediaAsset = require("./models/MediaAsset");
const BlogPost = require("./models/BlogPost");
const Agent = require("./models/Agent");
const DocFile = require("./models/DocFile");
const SssContent = require("./models/SssContent");
const PageContent = require("./models/PageContent");

const MANIFEST_PATH = path.join(__dirname, "../optimize-uploads-manifest.json");
const PUBLIC_BASE = (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/+$/, "");

const args = new Set(process.argv.slice(2));
const MODE_FILES = args.has("--files");
const MODE_DB = args.has("--db");
const APPLY = args.has("--apply");
const VERBOSE = args.has("--verbose");
const IMAGES_ONLY = args.has("--images-only");
const VIDEOS_ONLY = args.has("--videos-only");

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif", ".tif", ".tiff", ".bmp", ".webp"]);
const VIDEO_EXTS = new Set([".mov", ".mp4", ".webm", ".avi", ".mkv", ".m4v", ".mpeg", ".mpg"]);
const SKIP_EXTS = new Set([".svg", ".gif", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv"]);

const EXT_MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".bmp": "image/bmp",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".m4v": "video/x-m4v",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg",
};

const stats = {
  filesScanned: 0,
  optimized: 0,
  skipped: 0,
  failed: 0,
  bytesBefore: 0,
  bytesAfter: 0,
  dbDocsUpdated: 0,
  mediaAssetsUpdated: 0,
  docFilesUpdated: 0,
  oldFilesRemoved: 0,
};

const replacements = new Map();

function printUsage() {}

function publicUrlForRelative(relativePath) {
  return `${PUBLIC_BASE}/uploads/${relativePath.split("/").join("/")}`;
}

function relativePathFromAbs(absPath) {
  return normalizePathKey(path.relative(UPLOAD_DIR, absPath).split(path.sep).join("/"));
}

function mimeFromExt(filePath) {
  return EXT_MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function mediaKind(mimeType) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "other";
}

function shouldProcessFile(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  if (!ext || SKIP_EXTS.has(ext)) return false;

  const isImage = IMAGE_EXTS.has(ext);
  const isVideo = VIDEO_EXTS.has(ext);

  if (IMAGES_ONLY && !isImage) return false;
  if (VIDEOS_ONLY && !isVideo) return false;
  if (!isImage && !isVideo) return false;

  return true;
}

function walkUploadFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkUploadFiles(abs, out);
    } else if (entry.isFile()) {
      out.push(abs);
    }
  }

  return out;
}

function replaceUploadPathInUrl(url, newRel) {
  const marker = "/uploads/";
  const idx = url.toLowerCase().indexOf(marker);
  if (idx === -1) return url;
  return url.slice(0, idx + marker.length) + newRel.split("/").join("/");
}

function shouldRecurse(value) {
  if (!value || typeof value !== "object") return false;
  if (value instanceof Date) return false;
  if (value instanceof mongoose.Types.ObjectId) return false;
  if (Buffer.isBuffer(value)) return false;
  return true;
}

function replaceDeep(value) {
  if (typeof value === "string") {
    const rel = extractUploadsRelativePath(value);
    if (rel && replacements.has(rel)) {
      return replaceUploadPathInUrl(value, replacements.get(rel).newRel);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceDeep(item));
  }

  if (value instanceof Map) {
    const next = new Map();
    for (const [key, entry] of value.entries()) {
      next.set(key, replaceDeep(entry));
    }
    return next;
  }

  if (shouldRecurse(value)) {
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      next[key] = replaceDeep(entry);
    }
    return next;
  }

  return value;
}

function stableStringify(value) {
  return JSON.stringify(value, (_key, v) => (v instanceof Map ? Object.fromEntries(v) : v));
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function saveManifest() {
  const payload = {
    createdAt: new Date().toISOString(),
    publicBase: PUBLIC_BASE,
    uploadDir: UPLOAD_DIR,
    replacements: Object.fromEntries(replacements),
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(payload, null, 2), "utf8");}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Manifest bulunamadi: ${MANIFEST_PATH}\nOnce --files --apply calistirin.`);
  }

  const data = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  replacements.clear();

  for (const [oldRel, meta] of Object.entries(data.replacements || {})) {
    replacements.set(normalizePathKey(oldRel), meta);
  }return data;
}

function isAlreadyOptimized(absPath) {
  const rel = relativePathFromAbs(absPath);
  for (const meta of replacements.values()) {
    if (normalizePathKey(meta.newRel) === rel) return true;
  }
  return false;
}

async function optimizeFile(absPath) {
  const rel = relativePathFromAbs(absPath);

  if (isAlreadyOptimized(absPath)) {
    stats.skipped++;
    if (VERBOSE)return;
  }

  const mimeType = mimeFromExt(absPath);
  const buffer = fs.readFileSync(absPath);
  const beforeSize = buffer.length;

  const newFileNameGuess = applyNewExtension(
    path.basename(absPath),
    mimeType.startsWith("video/") ? ".mp4" : ".webp",
  );
  const newAbsGuess = path.join(path.dirname(absPath), newFileNameGuess);
  if (fs.existsSync(newAbsGuess) && APPLY) {
    stats.skipped++;
    if (VERBOSE)return;
  }

  const result = await optimizeUploadedFile({
    buffer,
    mimetype: mimeType,
    originalname: path.basename(absPath),
    size: beforeSize,
  });

  if (!result) {
    stats.skipped++;
    if (VERBOSE)return;
  }

  const newFileName = applyNewExtension(path.basename(absPath), result.newExt);
  const newAbs = path.join(path.dirname(absPath), newFileName);
  const newRel = relativePathFromAbs(newAbs);

  if (normalizePathKey(newRel) === rel) {
    stats.skipped++;
    if (VERBOSE)return;
  }

  if (replacements.has(rel)) return;

  const meta = {
    newRel,
    mimeType: result.mimeType,
    size: result.buffer.length,
    fileName: newFileName,
    bytesBefore: beforeSize,
  };

  stats.bytesBefore += beforeSize;
  stats.bytesAfter += result.buffer.length;
  stats.optimized++;

  if (!APPLY) {
    const pct = ((1 - result.buffer.length / beforeSize) * 100).toFixed(1);replacements.set(rel, meta);
    return;
  }

  fs.writeFileSync(newAbs, result.buffer);
  replacements.set(rel, meta);}

async function runFilesPhase() {if (IMAGES_ONLY)if (VIDEOS_ONLY)if (!fs.existsSync(UPLOAD_DIR)) {
    throw new Error(`uploads klasörü bulunamadı: ${UPLOAD_DIR}`);
  }

  const allFiles = walkUploadFiles(UPLOAD_DIR);
  const targets = allFiles.filter(shouldProcessFile);
  stats.filesScanned = targets.length;for (const absPath of targets) {
    try {
      await optimizeFile(absPath);
    } catch (err) {
      stats.failed++;}
  }

  if (!replacements.size) {return;
  }

  if (APPLY) {
    saveManifest();} else {}

  printFilesSummary();
}

async function migrateModel(Model, label) {
  const docs = await Model.find({});
  let updated = 0;

  for (const doc of docs) {
    const plain = doc.toObject({ flattenMaps: true });
    const before = stableStringify(plain);
    const afterObj = replaceDeep(plain);
    const after = stableStringify(afterObj);

    if (before === after) continue;

    updated++;
    stats.dbDocsUpdated++;

    if (!APPLY) {
      if (VERBOSE)continue;
    }

    await Model.replaceOne({ _id: doc._id }, afterObj);}}

async function updateMediaAssets() {
  const assets = await MediaAsset.find({});
  let count = 0;

  for (const asset of assets) {
    const rel = normalizePathKey(asset.relativePath || extractUploadsRelativePath(asset.url) || "");
    const meta = replacements.get(rel);
    if (!meta) continue;

    count++;
    stats.mediaAssetsUpdated++;

    if (!APPLY) {
      if (VERBOSE)continue;
    }

    asset.relativePath = meta.newRel;
    asset.url = publicUrlForRelative(meta.newRel);
    asset.fileName = meta.fileName;
    asset.mimeType = meta.mimeType;
    asset.size = meta.size;
    asset.kind = mediaKind(meta.mimeType);
    await asset.save();
  }}

async function updateDocFiles() {
  const files = await DocFile.find({});
  let count = 0;

  for (const file of files) {
    const rel = extractUploadsRelativePath(file.url || "");
    const meta = rel ? replacements.get(normalizePathKey(rel)) : null;
    if (!meta) continue;

    count++;
    stats.docFilesUpdated++;

    if (!APPLY) {
      if (VERBOSE)continue;
    }

    file.url = publicUrlForRelative(meta.newRel);
    file.mimeType = meta.mimeType;
    file.size = meta.size;
    await file.save();
  }}

function removeOldFiles() {
  if (!APPLY) return;

  for (const [oldRel, meta] of replacements) {
    const newAbs = path.join(UPLOAD_DIR, meta.newRel.split("/").join(path.sep));
    if (!fs.existsSync(newAbs)) {continue;
    }

    const abs = path.join(UPLOAD_DIR, oldRel.split("/").join(path.sep));
    if (!fs.existsSync(abs)) continue;

    try {
      fs.unlinkSync(abs);
      stats.oldFilesRemoved++;
      cleanupEmptyDirsFromRelativePath(oldRel);} catch (err) {}
  }
}

async function runDbPhase() {loadManifest();

  await connectDatabase();await migrateModel(Listing, "Listing");
  await migrateModel(PageContent, "PageContent");
  await migrateModel(BlogPost, "BlogPost");
  await migrateModel(Agent, "Agent");
  await migrateModel(SssContent, "SssContent");
  await updateMediaAssets();
  await updateDocFiles();

  if (APPLY) {removeOldFiles();} else {}

  printDbSummary();
  await mongoose.disconnect();
}

function printFilesSummary() {
  const saved = stats.bytesBefore - stats.bytesAfter;
  const pct = stats.bytesBefore > 0 ? ((saved / stats.bytesBefore) * 100).toFixed(1) : "0";}

function printDbSummary() {}

async function run() {
  if (!MODE_FILES && !MODE_DB) {
    printUsage();
    process.exit(1);
  }

  if (MODE_FILES && MODE_DB) {process.exit(1);
  }

  if (MODE_FILES) {
    await runFilesPhase();
    return;
  }

  await runDbPhase();
}

run().catch(async (err) => {try {
    await mongoose.disconnect();
  } catch {
  }
  process.exit(1);
});
