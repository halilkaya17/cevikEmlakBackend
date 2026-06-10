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

const MODELS = [
  [Listing, "Listing"],
  [PageContent, "PageContent"],
  [BlogPost, "BlogPost"],
  [MediaAsset, "MediaAsset"],
  [Agent, "Agent"],
  [DocFile, "DocFile"],
  [SssContent, "SssContent"],
];

const UPLOAD_DIR = path.join(__dirname, "../uploads");

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

  if (value instanceof Map) {
    for (const entry of value.values()) collectPathsFromValue(entry, paths);
    return;
  }

  if (shouldRecurse(value)) {
    for (const entry of Object.values(value)) collectPathsFromValue(entry, paths);
  }
}

async function collectReferencedPaths() {
  const paths = new Set();

  for (const [Model, label] of MODELS) {
    const docs = await Model.find({}).lean();
    let count = 0;
    for (const doc of docs) {
      const before = paths.size;
      collectPathsFromValue(doc, paths);
      if (paths.size > before) count++;
    }
  }

  return paths;
}

function walkUploadFiles(dir, baseDir = dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkUploadFiles(full, baseDir));
    } else if (entry.isFile()) {
      files.push({
        absolute: full,
        relative: path.relative(baseDir, full).split(path.sep).join("/"),
      });
    }
  }

  return files;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function run() {

  if (!fs.existsSync(UPLOAD_DIR)) {
    throw new Error(`uploads klasörü bulunamadı: ${UPLOAD_DIR}`);
  }

  await connectDatabase();
  const referenced = await collectReferencedPaths();

  const diskFiles = walkUploadFiles(UPLOAD_DIR);
  const orphans = [];

  for (const file of diskFiles) {
    const key = normalizePathKey(file.relative);
    if (!referenced.has(key)) {
      orphans.push(file);
    }
  }

  let totalBytes = 0;
  const showLimit = VERBOSE ? orphans.length : Math.min(orphans.length, 50);
  for (let i = 0; i < orphans.length; i++) {
    const file = orphans[i];
    const size = fs.statSync(file.absolute).size;
    totalBytes += size;
    if (i < showLimit) {
    }
  }

  if (orphans.length > showLimit) {
  }

  if (!orphans.length) {
    await mongoose.disconnect();
    return;
  }

  if (DRY_RUN) {
    await mongoose.disconnect();
    return;
  }

  let deleted = 0;
  let failed = 0;
  for (const file of orphans) {
    try {
      fs.unlinkSync(file.absolute);
      deleted++;
    } catch (error) {
      failed++;
    }
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
