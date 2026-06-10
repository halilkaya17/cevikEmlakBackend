/**
 * MongoDB'deki Cloudinary URL'lerini indirilen local dosya yollarına çevirir.
 *
 * Eşleştirme: res.cloudinary.com URL → public_id → uploads/{public_id}.{format}
 * Yeni URL: {PUBLIC_API_URL}/uploads/{relative-path}
 *
 * Kullanım:
 *   node src/migrate-cloudinary-urls-to-local.js --dry-run
 *   node src/migrate-cloudinary-urls-to-local.js
 *   node src/migrate-cloudinary-urls-to-local.js --verbose
 *
 * Ortam: MONGODB_URI, PUBLIC_API_URL (.env)
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { connectDatabase } = require("./config/db");

const Listing = require("./models/Listing");
const MediaAsset = require("./models/MediaAsset");
const BlogPost = require("./models/BlogPost");
const Agent = require("./models/Agent");
const DocFile = require("./models/DocFile");
const SssContent = require("./models/SssContent");
const PageContent = require("./models/PageContent");

const UPLOAD_DIR = path.join(__dirname, "../uploads");
const PUBLIC_BASE = (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/+$/, "");

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const VERBOSE = args.has("--verbose");

const stats = {
  docsUpdated: 0,
  urlsReplaced: 0,
  cloudinaryUrls: 0,
  unparsedPublicId: 0,
  missingLocalFile: [],
};

const modelSummaries = [];

function emptyModelStats() {
  return { docsUpdated: 0, cloudinaryUrls: 0, urlsReplaced: 0, missingLocal: 0, unparsedPublicId: 0 };
}

let activeModelStats = emptyModelStats();

function isCloudinaryUrl(value) {
  return typeof value === "string" && /res\.cloudinary\.com/i.test(value);
}

/** URL path segmentlerindeki %C3%A7 gibi encoding'i çöz (diskte ç, ı vb. dosya adları). */
function decodePublicIdSegments(publicId) {
  return publicId
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
}

function normalizeForCompare(value) {
  return decodePublicIdSegments(String(value || "")).normalize("NFC");
}

function isTransformSegment(segment) {
  if (!segment || segment.includes(".")) return false;
  if (/^v\d+$/.test(segment)) return false;
  return /^[a-z0-9]{1,4}_[^/]+(?:,[a-z0-9]{1,4}_[^/]+)*$/i.test(segment);
}

/** Cloudinary SDK v2'de public_id_from_url yok; URL'den public_id çıkar. */
function extractPublicIdFromCloudinaryUrl(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const uploadIdx = parts.indexOf("upload");
    if (uploadIdx === -1) return "";

    let i = uploadIdx + 1;
    while (i < parts.length) {
      const seg = parts[i];
      if (/^v\d+$/.test(seg) || isTransformSegment(seg)) {
        i++;
        continue;
      }
      break;
    }

    const rest = parts.slice(i).join("/");
    return decodePublicIdSegments(rest.replace(/\.[^/.]+$/, ""));
  } catch {
    return "";
  }
}

function formatFromCloudinaryUrl(url) {
  try {
    let last = new URL(url).pathname.split("/").pop() || "";
    try {
      last = decodeURIComponent(last);
    } catch {
      /* keep encoded */
    }
    const dot = last.lastIndexOf(".");
    if (dot > 0) return last.slice(dot + 1).toLowerCase();
  } catch {
    /* ignore */
  }
  return "";
}

function findLocalFile(publicId, formatHint) {
  const candidates = [];
  if (formatHint) {
    candidates.push(path.join(UPLOAD_DIR, `${publicId}.${formatHint}`));
  }
  candidates.push(path.join(UPLOAD_DIR, publicId));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  const dir = path.dirname(path.join(UPLOAD_DIR, publicId));
  const base = path.basename(publicId);
  const baseNorm = normalizeForCompare(base);
  if (!fs.existsSync(dir)) return null;

  const matches = fs.readdirSync(dir).filter((name) => {
    const nameNorm = normalizeForCompare(name);
    const nameBase = nameNorm.replace(/\.[^/.]+$/, "");
    return nameBase === baseNorm || nameNorm === baseNorm || name.startsWith(`${base}.`);
  });
  if (matches.length >= 1) {
    return path.join(dir, matches[0]);
  }

  return null;
}

function localUrlFromFile(localPath) {
  const rel = path.relative(UPLOAD_DIR, localPath).split(path.sep).join("/");
  return `${PUBLIC_BASE}/uploads/${rel}`;
}

function resolveCloudinaryUrl(url) {
  if (!isCloudinaryUrl(url)) return url;

  activeModelStats.cloudinaryUrls++;
  stats.cloudinaryUrls++;

  const publicId = extractPublicIdFromCloudinaryUrl(url);
  if (!publicId) {
    activeModelStats.unparsedPublicId++;
    stats.unparsedPublicId++;
    if (VERBOSE) console.log(`    [public_id çıkarılamadı] ${url}`);
    return url;
  }

  const format = formatFromCloudinaryUrl(url);
  const localPath = findLocalFile(publicId, format);
  if (!localPath) {
    activeModelStats.missingLocal++;
    stats.missingLocalFile.push({ url, publicId, format });
    return url;
  }

  const newUrl = localUrlFromFile(localPath);
  if (newUrl !== url) {
    activeModelStats.urlsReplaced++;
    stats.urlsReplaced++;
    if (VERBOSE) console.log(`    ${url}\n    → ${newUrl}`);
  }
  return newUrl;
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
    return isCloudinaryUrl(value) ? resolveCloudinaryUrl(value) : value;
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

async function migrateModel(Model, label) {
  activeModelStats = emptyModelStats();
  const docs = await Model.find({});

  for (const doc of docs) {
    const plain = doc.toObject({ flattenMaps: true });
    const before = stableStringify(plain);
    const afterObj = replaceDeep(plain);
    const after = stableStringify(afterObj);

    if (before === after) continue;

    activeModelStats.docsUpdated++;
    stats.docsUpdated++;

    if (DRY_RUN) {
      console.log(`  [dry-run] ${label} ${doc._id}`);
      continue;
    }

    await Model.replaceOne({ _id: doc._id }, afterObj);
    console.log(`  ✓ ${label} ${doc._id}`);
  }

  const summary = {
    label,
    totalDocs: docs.length,
    ...activeModelStats,
  };
  modelSummaries.push(summary);

  console.log(
    `${label}: ${summary.totalDocs} kayıt | ${summary.docsUpdated} doküman | ` +
      `${summary.cloudinaryUrls} Cloudinary URL | ${summary.urlsReplaced} URL değişecek | ` +
      `${summary.missingLocal} local dosya yok | ${summary.unparsedPublicId} public_id okunamadı`,
  );
}

async function run() {
  console.log("Cloudinary URL → local migration");
  console.log(`  mod         : ${DRY_RUN ? "dry-run" : "yaz"}`);
  console.log(`  PUBLIC_BASE : ${PUBLIC_BASE}`);
  console.log(`  uploads     : ${UPLOAD_DIR}\n`);

  if (!fs.existsSync(UPLOAD_DIR)) {
    throw new Error(`uploads klasörü bulunamadı: ${UPLOAD_DIR}`);
  }

  await connectDatabase();

  await migrateModel(Listing, "Listing");
  await migrateModel(PageContent, "PageContent");
  await migrateModel(BlogPost, "BlogPost");
  await migrateModel(MediaAsset, "MediaAsset");
  await migrateModel(Agent, "Agent");
  await migrateModel(DocFile, "DocFile");
  await migrateModel(SssContent, "SssContent");

  console.log("\n=== ÖZET ===");
  console.log(`Güncellenen doküman : ${stats.docsUpdated}`);
  console.log(`Cloudinary URL      : ${stats.cloudinaryUrls}`);
  console.log(`Değişecek URL       : ${stats.urlsReplaced}`);
  console.log(`Local dosya yok     : ${stats.missingLocalFile.length}`);
  console.log(`public_id okunamadı : ${stats.unparsedPublicId}`);

  if (modelSummaries.length) {
    console.log("\nKoleksiyon bazında:");
    for (const row of modelSummaries) {
      console.log(
        `  ${row.label.padEnd(12)} doküman: ${String(row.docsUpdated).padStart(3)} | ` +
          `Cloudinary URL: ${String(row.cloudinaryUrls).padStart(4)} | değişecek: ${String(row.urlsReplaced).padStart(4)}`,
      );
    }
  }

  if (stats.missingLocalFile.length) {
    console.log("\nLocal karşılığı bulunamayan URL'ler (ilk 15):");
    for (const item of stats.missingLocalFile.slice(0, 15)) {
      console.log(`  - ${item.publicId}${item.format ? `.${item.format}` : ""}`);
      if (VERBOSE) console.log(`    ${item.url}`);
    }
    if (stats.missingLocalFile.length > 15) {
      console.log(`  ... ve ${stats.missingLocalFile.length - 15} kayıt daha`);
    }
  }

  if (DRY_RUN) {
    console.log("\nGerçek güncelleme için: node src/migrate-cloudinary-urls-to-local.js");
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
