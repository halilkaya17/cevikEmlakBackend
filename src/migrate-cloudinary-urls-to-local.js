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
    }
    const dot = last.lastIndexOf(".");
    if (dot > 0) return last.slice(dot + 1).toLowerCase();
  } catch {
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
    if (VERBOSE)return url;
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
    stats.urlsReplaced++;}
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

    if (DRY_RUN) {continue;
    }

    await Model.replaceOne({ _id: doc._id }, afterObj);}

  const summary = {
    label,
    totalDocs: docs.length,
    ...activeModelStats,
  };
  modelSummaries.push(summary);}

async function run() {if (!fs.existsSync(UPLOAD_DIR)) {
    throw new Error(`uploads klasörü bulunamadı: ${UPLOAD_DIR}`);
  }

  await connectDatabase();

  await migrateModel(Listing, "Listing");
  await migrateModel(PageContent, "PageContent");
  await migrateModel(BlogPost, "BlogPost");
  await migrateModel(MediaAsset, "MediaAsset");
  await migrateModel(Agent, "Agent");
  await migrateModel(DocFile, "DocFile");
  await migrateModel(SssContent, "SssContent");if (modelSummaries.length) {for (const row of modelSummaries) {}
  }

  if (stats.missingLocalFile.length) {for (const item of stats.missingLocalFile.slice(0, 15)) {}
    if (stats.missingLocalFile.length > 15) {}
  }

  if (DRY_RUN) {}

  await mongoose.disconnect();
}

run().catch(async (err) => {try {
    await mongoose.disconnect();
  } catch {
  }
  process.exit(1);
});
