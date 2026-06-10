/**
 * Kullanılmayan MediaAsset kayıtlarını ve dosyalarını siler.
 *
 * "Kullanılmıyor" = URL başka hiçbir koleksiyonda geçmiyor (PageContent, Listing, vb.)
 * "Yinelenen" = URL başka yerde kullanılıyor ama MediaAsset'te de var → sadece DB kaydı silinir
 *
 * Kullanım:
 *   node src/cleanup-unused-media-assets.js --dry-run
 *   node src/cleanup-unused-media-assets.js --delete
 *
 * Ortam: MONGODB_URI (.env)
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { connectDatabase } = require("./config/db");

const Listing = require("./models/Listing");
const PageContent = require("./models/PageContent");
const BlogPost = require("./models/BlogPost");
const Agent = require("./models/Agent");
const DocFile = require("./models/DocFile");
const SssContent = require("./models/SssContent");
const MediaAsset = require("./models/MediaAsset");

const UPLOAD_DIR = path.join(__dirname, "../uploads");

const CONTENT_MODELS = [
  [Listing, "Listing"],
  [PageContent, "PageContent"],
  [BlogPost, "BlogPost"],
  [Agent, "Agent"],
  [DocFile, "DocFile"],
  [SssContent, "SssContent"],
];

const args = new Set(process.argv.slice(2));
const DRY_RUN = !args.has("--delete");
const VERBOSE = args.has("--verbose");

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

function shouldRecurse(value) {
  if (!value || typeof value !== "object") return false;
  if (value instanceof Date) return false;
  if (value instanceof mongoose.Types.ObjectId) return false;
  if (Buffer.isBuffer(value)) return false;
  return true;
}

function collectPathsFromValue(value, paths) {
  if (typeof value === "string") {
    const rel = extractUploadsRelativePath(value);
    if (rel) paths.add(rel);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPathsFromValue(item, paths);
    return;
  }
  if (shouldRecurse(value)) {
    for (const entry of Object.values(value)) collectPathsFromValue(entry, paths);
  }
}

function absolutePathForRelative(relativePath) {
  return path.join(UPLOAD_DIR, relativePath.split("/").join(path.sep));
}

async function collectContentReferencedPaths() {
  const paths = new Set();
  for (const [Model, label] of CONTENT_MODELS) {
    const docs = await Model.find({}).lean();
    for (const doc of docs) collectPathsFromValue(doc, paths);
    console.log(`${label}: ${docs.length} kayıt`);
  }
  return paths;
}

async function run() {
  console.log("Kullanılmayan MediaAsset temizliği");
  console.log(`  mod: ${DRY_RUN ? "dry-run" : "SİL (--delete)"}\n`);

  await connectDatabase();

  const contentPaths = await collectContentReferencedPaths();
  console.log(`\nİçerikte referanslı dosya yolu: ${contentPaths.size}`);

  const assets = await MediaAsset.find({}).sort({ createdAt: -1 });
  console.log(`MediaAsset kayıt: ${assets.length}\n`);

  const toDeleteWithFile = [];
  const toDeleteRecordOnly = [];
  const toKeep = [];

  for (const asset of assets) {
    const rel = extractUploadsRelativePath(asset.url);
    if (!rel) {
      toKeep.push({ asset, reason: "local uploads URL değil" });
      continue;
    }

    if (contentPaths.has(rel)) {
      toDeleteRecordOnly.push({ asset, rel });
    } else {
      toDeleteWithFile.push({ asset, rel });
    }
  }

  console.log("=== SİLİNECEK (dosya + kayıt) — hiçbir yerde kullanılmıyor ===");
  for (const { asset, rel } of toDeleteWithFile) {
    const exists = fs.existsSync(absolutePathForRelative(rel));
    console.log(`  ${asset.originalName || asset.fileName}`);
    console.log(`    id: ${asset._id} | ${rel} | disk: ${exists ? "var" : "yok"}`);
  }

  console.log("\n=== SİLİNECEK (sadece kayıt) — dosya başka içerikte kullanılıyor ===");
  for (const { asset, rel } of toDeleteRecordOnly) {
    if (VERBOSE) {
      console.log(`  ${asset.originalName || asset.fileName} (${rel})`);
    } else {
      console.log(`  ${asset.originalName || asset.fileName}`);
    }
  }
  if (!VERBOSE && toDeleteRecordOnly.length) {
    console.log("  (--verbose ile tam liste)");
  }

  if (toKeep.length) {
    console.log("\n=== KALACAK ===");
    for (const { asset, reason } of toKeep) {
      console.log(`  ${asset.originalName || asset.fileName} — ${reason}`);
    }
  }

  console.log("\n=== ÖZET ===");
  console.log(`Silinecek (dosya+d kayıt): ${toDeleteWithFile.length}`);
  console.log(`Silinecek (yalnız kayıt) : ${toDeleteRecordOnly.length}`);
  console.log(`Kalacak                  : ${toKeep.length}`);

  if (DRY_RUN) {
    console.log("\nGerçek silme için: node src/cleanup-unused-media-assets.js --delete");
    await mongoose.disconnect();
    return;
  }

  let recordsDeleted = 0;
  let filesDeleted = 0;
  let fileErrors = 0;

  for (const { asset, rel } of [...toDeleteWithFile, ...toDeleteRecordOnly]) {
    await MediaAsset.findByIdAndDelete(asset._id);
    recordsDeleted++;
  }

  for (const { rel } of toDeleteWithFile) {
    const abs = absolutePathForRelative(rel);
    if (!fs.existsSync(abs)) continue;
    try {
      fs.unlinkSync(abs);
      filesDeleted++;
    } catch (error) {
      fileErrors++;
      console.error(`  ✗ dosya silinemedi ${rel}: ${error.message}`);
    }
  }

  console.log(`\nSilinen kayıt: ${recordsDeleted}, silinen dosya: ${filesDeleted}, dosya hatası: ${fileErrors}`);
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
