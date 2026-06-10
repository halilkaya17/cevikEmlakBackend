/**
 * DB'deki /uploads/ URL'lerinin base kısmını PUBLIC_API_URL ile hizalar.
 * Migration localhost ile çalıştırıldıysa (http://localhost:5001/uploads/...)
 * production frontend görselleri yükleyemez — bu script düzeltir.
 *
 * Kullanım:
 *   node src/fix-uploads-base-url.js --dry-run
 *   node src/fix-uploads-base-url.js
 *
 * Ortam: MONGODB_URI, PUBLIC_API_URL (.env)
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const mongoose = require("mongoose");
const { connectDatabase } = require("./config/db");

const Listing = require("./models/Listing");
const MediaAsset = require("./models/MediaAsset");
const BlogPost = require("./models/BlogPost");
const Agent = require("./models/Agent");
const DocFile = require("./models/DocFile");
const SssContent = require("./models/SssContent");
const PageContent = require("./models/PageContent");

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const VERBOSE = args.has("--verbose");

const TARGET_BASE = (process.env.PUBLIC_API_URL || "").replace(/\/+$/, "");
if (!TARGET_BASE) {
  console.error("PUBLIC_API_URL .env içinde tanımlı olmalı (örn. https://api.cevikemlak.com)");
  process.exit(1);
}

/** http://localhost:5001/uploads/... veya başka host /uploads/ → hedef base */
const UPLOADS_URL_RE = /https?:\/\/[^/]+\/uploads\//gi;

const stats = { docsUpdated: 0, urlsFixed: 0 };

function fixUploadsUrl(value) {
  if (typeof value !== "string" || !value.includes("/uploads/")) return value;
  if (!UPLOADS_URL_RE.test(value)) return value;
  UPLOADS_URL_RE.lastIndex = 0;
  const fixed = value.replace(UPLOADS_URL_RE, `${TARGET_BASE}/uploads/`);
  if (fixed !== value) stats.urlsFixed++;
  if (VERBOSE && fixed !== value) console.log(`    ${value}\n    → ${fixed}`);
  return fixed;
}

function shouldRecurse(value) {
  if (!value || typeof value !== "object") return false;
  if (value instanceof Date) return false;
  if (value instanceof mongoose.Types.ObjectId) return false;
  if (Buffer.isBuffer(value)) return false;
  return true;
}

function replaceDeep(value) {
  if (typeof value === "string") return fixUploadsUrl(value);
  if (Array.isArray(value)) return value.map((item) => replaceDeep(item));
  if (value instanceof Map) {
    const next = new Map();
    for (const [key, entry] of value.entries()) next.set(key, replaceDeep(entry));
    return next;
  }
  if (shouldRecurse(value)) {
    const next = {};
    for (const [key, entry] of Object.entries(value)) next[key] = replaceDeep(entry);
    return next;
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(value, (_key, v) => (v instanceof Map ? Object.fromEntries(v) : v));
}

async function migrateModel(Model, label) {
  const docs = await Model.find({});
  let updated = 0;
  const beforeCount = stats.urlsFixed;

  for (const doc of docs) {
    const plain = doc.toObject({ flattenMaps: true });
    const before = stableStringify(plain);
    const afterObj = replaceDeep(plain);
    const after = stableStringify(afterObj);
    if (before === after) continue;

    updated++;
    stats.docsUpdated++;

    if (DRY_RUN) {
      console.log(`  [dry-run] ${label} ${doc._id}`);
      continue;
    }

    await Model.replaceOne({ _id: doc._id }, afterObj);
    console.log(`  ✓ ${label} ${doc._id}`);
  }

  const fixedInModel = stats.urlsFixed - beforeCount;
  console.log(`${label}: ${docs.length} kayıt | ${updated} doküman | ${fixedInModel} URL düzeltildi`);
}

async function run() {
  console.log("Uploads base URL düzeltme");
  console.log(`  mod          : ${DRY_RUN ? "dry-run" : "yaz"}`);
  console.log(`  hedef base   : ${TARGET_BASE}\n`);

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
  console.log(`Düzeltilen URL      : ${stats.urlsFixed}`);

  if (DRY_RUN) {
    console.log("\nGerçek güncelleme için: node src/fix-uploads-base-url.js");
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
