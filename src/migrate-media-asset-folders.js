/**
 * MediaAsset medyalarını uploads/media/{assetId}/ altına taşır ve DB günceller.
 *
 * Kapsam (MediaAsset):
 *   url
 *
 * Kullanım:
 *   node src/migrate-media-asset-folders.js --dry-run
 *   node src/migrate-media-asset-folders.js --apply
 *
 * Ortam: MONGODB_URI, PUBLIC_API_URL (.env)
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { connectDatabase } = require("./config/db");
const MediaAsset = require("./models/MediaAsset");

const UPLOAD_DIR = path.join(__dirname, "../uploads");
const MEDIA_DIR = path.join(UPLOAD_DIR, "media");
const PUBLIC_BASE = (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/+$/, "");

const args = new Set(process.argv.slice(2));
const DRY_RUN = !args.has("--apply");
const VERBOSE = args.has("--verbose");

const stats = {
  assetsProcessed: 0,
  assetsUpdated: 0,
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

function mediaFolderPrefix(assetId) {
  return `media/${assetId}/`;
}

function buildRefCounts(assets) {
  const counts = new Map();
  for (const asset of assets) {
    const url = asset.url;
    if (!isLocalUploadsUrl(url)) continue;
    const rel = extractUploadsRelativePath(url);
    if (!rel) continue;
    counts.set(rel, (counts.get(rel) || 0) + 1);
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

function resolveNewUrl(oldUrl, assetId, refCounts, cache) {
  if (!isLocalUploadsUrl(oldUrl)) return oldUrl;
  if (cache.has(oldUrl)) return cache.get(oldUrl);

  const rel = extractUploadsRelativePath(oldUrl);
  if (!rel) return oldUrl;

  const prefix = mediaFolderPrefix(assetId);
  if (rel.startsWith(prefix)) {
    stats.alreadyInPlace++;
    cache.set(oldUrl, oldUrl);
    return oldUrl;
  }

  const srcPath = absolutePathForRelative(rel);
  if (!fs.existsSync(srcPath)) {
    stats.missingFile++;
    if (VERBOSE) console.log(`    [dosya yok] ${rel}`);
    cache.set(oldUrl, oldUrl);
    return oldUrl;
  }

  const destDir = path.join(MEDIA_DIR, assetId);
  const { filename, destPath } = pickDestFilename(destDir, srcPath);
  const newRel = `${prefix}${filename}`;
  const newUrl = publicUrlForRelative(newRel);
  const copy = (refCounts.get(rel) || 0) > 1;

  if (DRY_RUN) {
    console.log(`    [dry-run] ${copy ? "kopyala" : "taşı"}: ${rel} → ${newRel}`);
  } else if (!fs.existsSync(destPath)) {
    transferFile(srcPath, destPath, copy);
  }

  cache.set(oldUrl, newUrl);
  if (newUrl !== oldUrl) stats.urlsUpdated++;
  return newUrl;
}

function transformAsset(asset, refCounts) {
  const assetId = String(asset._id);
  const next = asset.toObject();
  if (next.url) {
    next.url = resolveNewUrl(next.url, assetId, refCounts, new Map());
  }
  return next;
}

function stableStringify(value) {
  return JSON.stringify(value);
}

async function run() {
  console.log("MediaAsset medyalarını media/{id}/ altına taşıma");
  console.log(`  mod         : ${DRY_RUN ? "dry-run" : "uygula"}`);
  console.log(`  PUBLIC_BASE : ${PUBLIC_BASE}`);
  console.log(`  hedef       : ${MEDIA_DIR}\n`);

  await connectDatabase();

  const assets = await MediaAsset.find({});
  console.log(`Toplam MediaAsset: ${assets.length}\n`);

  if (!assets.length) {
    console.log("Taşınacak MediaAsset yok.");
    await mongoose.disconnect();
    return;
  }

  const refCounts = buildRefCounts(assets);
  console.log(`Benzersiz local medya yolu: ${refCounts.size}\n`);

  for (const asset of assets) {
    stats.assetsProcessed++;
    const before = stableStringify(asset.toObject());
    const afterObj = transformAsset(asset, refCounts);
    const after = stableStringify(afterObj);

    if (before === after) continue;

    stats.assetsUpdated++;

    const label = asset.originalName || asset.fileName || asset._id;
    if (DRY_RUN) {
      console.log(`[dry-run] MediaAsset ${asset._id} (${label})`);
      continue;
    }

    await MediaAsset.replaceOne({ _id: asset._id }, afterObj);
    console.log(`✓ MediaAsset ${asset._id} (${label})`);
  }

  console.log("\n=== ÖZET ===");
  console.log(`İşlenen asset     : ${stats.assetsProcessed}`);
  console.log(`Güncellenen       : ${stats.assetsUpdated}`);
  console.log(`Güncellenen URL   : ${stats.urlsUpdated}`);
  console.log(`Taşınan dosya     : ${stats.filesMoved}`);
  console.log(`Kopyalanan dosya  : ${stats.filesCopied}`);
  console.log(`Zaten doğru klasör: ${stats.alreadyInPlace}`);
  console.log(`Dosya bulunamadı  : ${stats.missingFile}`);
  console.log(`Cloudinary (atlandı): ${stats.skippedExternal}`);

  if (DRY_RUN) {
    console.log("\nGerçek taşıma için: node src/migrate-media-asset-folders.js --apply");
  }

  await mongoose.disconnect();
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
