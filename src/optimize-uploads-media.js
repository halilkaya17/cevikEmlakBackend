/**
 * uploads/ medya optimizasyonu — iki aşamalı:
 *   1) Dosyaları optimize et (DB'ye dokunma)
 *   2) Manifest'e göre DB güncelle + eski dosyaları sil
 *
 * Aşama 1 — dosyalar:
 *   node src/optimize-uploads-media.js --files                  # dry-run
 *   node src/optimize-uploads-media.js --files --apply          # WebP/MP4 yaz + manifest kaydet
 *   node src/optimize-uploads-media.js --files --apply --verbose
 *   node src/optimize-uploads-media.js --files --apply --images-only
 *
 * Aşama 2 — veritabanı (manifest hazır olduktan sonra):
 *   node src/optimize-uploads-media.js --db                     # dry-run
 *   node src/optimize-uploads-media.js --db --apply             # DB güncelle + eski dosyaları sil
 *
 * Ortam: MONGODB_URI, PUBLIC_API_URL, UPLOAD_DIR (.env)
 */

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

/** @type {Map<string, { newRel: string, mimeType: string, size: number, fileName: string, bytesBefore?: number }>} */
const replacements = new Map();

function printUsage() {
  console.log(`
Kullanım:

  Aşama 1 — dosyaları optimize et (DB'ye dokunmaz):
    node src/optimize-uploads-media.js --files
    node src/optimize-uploads-media.js --files --apply

  Aşama 2 — manifest'e göre DB güncelle:
    node src/optimize-uploads-media.js --db
    node src/optimize-uploads-media.js --db --apply

  Filtreler: --images-only | --videos-only | --verbose
`);
}

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
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(payload, null, 2), "utf8");
  console.log(`\nManifest kaydedildi: ${MANIFEST_PATH}`);
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Manifest bulunamadi: ${MANIFEST_PATH}\nOnce --files --apply calistirin.`);
  }

  const data = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  replacements.clear();

  for (const [oldRel, meta] of Object.entries(data.replacements || {})) {
    replacements.set(normalizePathKey(oldRel), meta);
  }

  console.log(`Manifest yuklendi: ${replacements.size} esleme (${MANIFEST_PATH})`);
  return data;
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
    if (VERBOSE) console.log(`  atla (hedef dosya) ${rel}`);
    return;
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
    if (VERBOSE) console.log(`  atla (hedef zaten var) ${rel}`);
    return;
  }

  const result = await optimizeUploadedFile({
    buffer,
    mimetype: mimeType,
    originalname: path.basename(absPath),
    size: beforeSize,
  });

  if (!result) {
    stats.skipped++;
    if (VERBOSE) console.log(`  atla  ${rel}`);
    return;
  }

  const newFileName = applyNewExtension(path.basename(absPath), result.newExt);
  const newAbs = path.join(path.dirname(absPath), newFileName);
  const newRel = relativePathFromAbs(newAbs);

  if (normalizePathKey(newRel) === rel) {
    stats.skipped++;
    if (VERBOSE) console.log(`  atla (ayni yol) ${rel}`);
    return;
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
    const pct = ((1 - result.buffer.length / beforeSize) * 100).toFixed(1);
    console.log(
      `  [dry-run] ${rel}\n           → ${newRel}  (${formatBytes(beforeSize)} → ${formatBytes(result.buffer.length)}, -${pct}%)`,
    );
    replacements.set(rel, meta);
    return;
  }

  fs.writeFileSync(newAbs, result.buffer);
  replacements.set(rel, meta);

  console.log(
    `  ✓ ${rel} → ${newRel}  (${formatBytes(beforeSize)} → ${formatBytes(result.buffer.length)})`,
  );
}

async function runFilesPhase() {
  console.log("Aşama 1: dosya optimizasyonu");
  console.log(`  mod         : ${APPLY ? "apply" : "dry-run"}`);
  console.log(`  uploads     : ${UPLOAD_DIR}`);
  if (IMAGES_ONLY) console.log("  filtre      : sadece görseller");
  if (VIDEOS_ONLY) console.log("  filtre      : sadece videolar");
  console.log("  DB          : dokunulmaz\n");

  if (!fs.existsSync(UPLOAD_DIR)) {
    throw new Error(`uploads klasörü bulunamadı: ${UPLOAD_DIR}`);
  }

  const allFiles = walkUploadFiles(UPLOAD_DIR);
  const targets = allFiles.filter(shouldProcessFile);
  stats.filesScanned = targets.length;

  console.log(`Taranan dosya: ${targets.length}\n`);

  for (const absPath of targets) {
    try {
      await optimizeFile(absPath);
    } catch (err) {
      stats.failed++;
      console.warn(`  HATA ${relativePathFromAbs(absPath)}: ${err.message}`);
    }
  }

  if (!replacements.size) {
    console.log("\nOptimize edilecek dosya yok.");
    return;
  }

  if (APPLY) {
    saveManifest();
    console.log("\nSonraki adim: node src/optimize-uploads-media.js --db --apply");
  } else {
    console.log(`\n${replacements.size} dosya optimize edilecek.`);
    console.log("Dosyalari yazmak icin: node src/optimize-uploads-media.js --files --apply");
  }

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
      if (VERBOSE) console.log(`  [dry-run] ${label} ${doc._id}`);
      continue;
    }

    await Model.replaceOne({ _id: doc._id }, afterObj);
    if (VERBOSE) console.log(`  ✓ DB ${label} ${doc._id}`);
  }

  console.log(`${label}: ${docs.length} kayıt, ${updated} güncellenecek`);
}

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
      if (VERBOSE) console.log(`  [dry-run] MediaAsset ${asset._id}: ${rel} → ${meta.newRel}`);
      continue;
    }

    asset.relativePath = meta.newRel;
    asset.url = publicUrlForRelative(meta.newRel);
    asset.fileName = meta.fileName;
    asset.mimeType = meta.mimeType;
    asset.size = meta.size;
    asset.kind = mediaKind(meta.mimeType);
    await asset.save();
  }

  console.log(`MediaAsset: ${assets.length} kayıt, ${count} güncellenecek`);
}

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
      if (VERBOSE) console.log(`  [dry-run] DocFile ${file._id}: ${rel} → ${meta.newRel}`);
      continue;
    }

    file.url = publicUrlForRelative(meta.newRel);
    file.mimeType = meta.mimeType;
    file.size = meta.size;
    await file.save();
  }

  console.log(`DocFile: ${files.length} kayıt, ${count} güncellenecek`);
}

function removeOldFiles() {
  if (!APPLY) return;

  for (const [oldRel, meta] of replacements) {
    const newAbs = path.join(UPLOAD_DIR, meta.newRel.split("/").join(path.sep));
    if (!fs.existsSync(newAbs)) {
      console.warn(`  atlandi (yeni dosya yok): ${meta.newRel}`);
      continue;
    }

    const abs = path.join(UPLOAD_DIR, oldRel.split("/").join(path.sep));
    if (!fs.existsSync(abs)) continue;

    try {
      fs.unlinkSync(abs);
      stats.oldFilesRemoved++;
      cleanupEmptyDirsFromRelativePath(oldRel);
      if (VERBOSE) console.log(`  silindi ${oldRel}`);
    } catch (err) {
      console.warn(`  silinemedi ${oldRel}: ${err.message}`);
    }
  }
}

async function runDbPhase() {
  console.log("Aşama 2: veritabanı güncelleme");
  console.log(`  mod         : ${APPLY ? "apply" : "dry-run"}`);
  console.log(`  PUBLIC_BASE : ${PUBLIC_BASE}\n`);

  loadManifest();

  await connectDatabase();

  console.log("Veritabanı taranıyor...\n");
  await migrateModel(Listing, "Listing");
  await migrateModel(PageContent, "PageContent");
  await migrateModel(BlogPost, "BlogPost");
  await migrateModel(Agent, "Agent");
  await migrateModel(SssContent, "SssContent");
  await updateMediaAssets();
  await updateDocFiles();

  if (APPLY) {
    console.log("\nEski dosyalar siliniyor...");
    removeOldFiles();
    console.log("\nTamamlandi. Manifest dosyasini saklayabilir veya silebilirsiniz.");
  } else {
    console.log("\nDB guncellemek icin: node src/optimize-uploads-media.js --db --apply");
  }

  printDbSummary();
  await mongoose.disconnect();
}

function printFilesSummary() {
  const saved = stats.bytesBefore - stats.bytesAfter;
  const pct = stats.bytesBefore > 0 ? ((saved / stats.bytesBefore) * 100).toFixed(1) : "0";

  console.log("\n=== DOSYA ÖZETİ ===");
  console.log(`Optimize edilen : ${stats.optimized}`);
  console.log(`Atlanan         : ${stats.skipped}`);
  console.log(`Hata            : ${stats.failed}`);
  console.log(`Boyut (önce)    : ${formatBytes(stats.bytesBefore)}`);
  console.log(`Boyut (sonra)   : ${formatBytes(stats.bytesAfter)}`);
  console.log(`Tasarruf        : ${formatBytes(saved)} (${pct}%)`);
}

function printDbSummary() {
  console.log("\n=== DB ÖZETİ ===");
  console.log(`DB doküman      : ${stats.dbDocsUpdated}`);
  console.log(`MediaAsset      : ${stats.mediaAssetsUpdated}`);
  console.log(`DocFile         : ${stats.docFilesUpdated}`);
  console.log(`Silinen eski    : ${stats.oldFilesRemoved}`);
}

async function run() {
  if (!MODE_FILES && !MODE_DB) {
    printUsage();
    process.exit(1);
  }

  if (MODE_FILES && MODE_DB) {
    console.error("Hata: --files ve --db ayni anda kullanilamaz.");
    process.exit(1);
  }

  if (MODE_FILES) {
    await runFilesPhase();
    return;
  }

  await runDbPhase();
}

run().catch(async (err) => {
  console.error("\nHata:", err.message || err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
