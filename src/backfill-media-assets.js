/**
 * İçerik koleksiyonlarındaki mevcut medya URL'leri için MediaAsset kayıtları oluşturur.
 *
 * Kapsam: Listing, PageContent, BlogPost, Agent, SssContent, DocFile
 * (DocFile görselleri/dosyaları da envantere alınır)
 *
 * Kullanım:
 *   node src/backfill-media-assets.js --dry-run
 *   node src/backfill-media-assets.js --apply
 *   node src/backfill-media-assets.js --apply --verbose
 *
 * Ortam: MONGODB_URI, PUBLIC_API_URL (.env)
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { connectDatabase } = require("./config/db");
const MediaAsset = require("./models/MediaAsset");
const Listing = require("./models/Listing");
const PageContent = require("./models/PageContent");
const BlogPost = require("./models/BlogPost");
const Agent = require("./models/Agent");
const SssContent = require("./models/SssContent");
const DocFile = require("./models/DocFile");
const {
  normalizePathKey,
  extractUploadsRelativePath,
  isCloudinaryUrl,
  collectPathsFromDocument,
} = require("./utils/uploadPaths");
const { publicUrlForRelative, UPLOAD_DIR, PUBLIC_BASE } = require("./services/mediaStorage");

const CONTENT_MODELS = [
  [Listing, "Listing"],
  [PageContent, "PageContent"],
  [BlogPost, "BlogPost"],
  [Agent, "Agent"],
  [SssContent, "SssContent"],
  [DocFile, "DocFile"],
];

const args = new Set(process.argv.slice(2));
const DRY_RUN = !args.has("--apply");
const VERBOSE = args.has("--verbose");

const stats = {
  uniqueUrls: 0,
  created: 0,
  skippedExisting: 0,
  skippedMissingFile: 0,
  cloudinaryUrls: 0,
};

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractPublicIdFromCloudinaryUrl(url) {
  if (!isCloudinaryUrl(url)) return "";
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const uploadIdx = parts.indexOf("upload");
    if (uploadIdx === -1) return "";
    let i = uploadIdx + 1;
    while (i < parts.length) {
      const seg = parts[i];
      if (/^v\d+$/.test(seg) || /^[a-z0-9]{1,4}_[^/]+(?:,[a-z0-9]{1,4}_[^/]+)*$/i.test(seg)) {
        i++;
        continue;
      }
      break;
    }
    const rest = parts.slice(i).join("/");
    return decodeURIComponent(rest.replace(/\.[^/.]+$/, ""));
  } catch {
    return "";
  }
}

function inferScopeFromRelativePath(relativePath) {
  const parts = relativePath.split("/").filter(Boolean);
  const [root, second] = parts;

  switch (root) {
    case "listings":
      return { scope: "listing", entityId: second || "", pageKey: "" };
    case "blogs":
      return { scope: "blog", entityId: second || "", pageKey: "" };
    case "agents":
      return { scope: "agent", entityId: second || "", pageKey: "" };
    case "docs":
      return { scope: "doc", entityId: second || "", pageKey: "" };
    case "pages":
      return { scope: "page", entityId: "", pageKey: second || "" };
    case "sss":
      return { scope: "sss", entityId: "", pageKey: "" };
    case "media":
      return { scope: "library", entityId: second || "", pageKey: "" };
    default:
      return { scope: "library", entityId: "", pageKey: "" };
  }
}

function kindFromPath(relativePath, mimeType = "") {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.includes("pdf") || mimeType.includes("document")) return "document";

  const ext = path.extname(relativePath).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif"].includes(ext)) return "image";
  if ([".mp4", ".webm", ".mov", ".avi"].includes(ext)) return "video";
  if ([".pdf", ".doc", ".docx"].includes(ext)) return "document";
  return "other";
}

function absolutePathForRelative(relativePath) {
  return path.join(UPLOAD_DIR, relativePath.split("/").join(path.sep));
}

function fileNameFromPath(relativePath) {
  return path.basename(relativePath.split("/").join(path.sep));
}

/** key → { type: 'local'|'cloudinary', relativePath, url, sources: Set } */
async function collectReferencedMedia() {
  const map = new Map();

  for (const [Model, label] of CONTENT_MODELS) {
    const docs = await Model.find({}).lean();
    for (const doc of docs) {
      const paths = collectPathsFromDocument(doc);
      for (const key of paths) {
        if (isCloudinaryUrl(key)) {
          if (!map.has(key)) {
            map.set(key, { type: "cloudinary", url: key, relativePath: "", sources: new Set() });
          }
          map.get(key).sources.add(label);
          continue;
        }

        const rel = normalizePathKey(key);
        if (!map.has(rel)) {
          map.set(rel, {
            type: "local",
            relativePath: rel,
            url: publicUrlForRelative(rel),
            sources: new Set(),
          });
        }
        map.get(rel).sources.add(label);
      }
    }
  }

  return map;
}

async function mediaAssetExists({ url, relativePath, cloudinaryId }) {
  const conditions = [];
  if (url) conditions.push({ url });
  if (relativePath) conditions.push({ relativePath });
  if (cloudinaryId) conditions.push({ cloudinaryId });
  if (relativePath) {
    conditions.push({ url: { $regex: `/uploads/${escapeRegex(relativePath)}([?#]|$)` } });
  }
  if (!conditions.length) return null;
  return MediaAsset.findOne({ $or: conditions }).lean();
}

async function run() {
  console.log("Mevcut medyalar için MediaAsset backfill");
  console.log(`  mod         : ${DRY_RUN ? "dry-run" : "uygula"}`);
  console.log(`  PUBLIC_BASE : ${PUBLIC_BASE}`);
  console.log(`  uploads     : ${UPLOAD_DIR}\n`);

  await connectDatabase();

  const referenced = await collectReferencedMedia();
  stats.uniqueUrls = referenced.size;
  console.log(`Benzersiz medya referansı: ${referenced.size}\n`);

  for (const [key, meta] of [...referenced.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const { type, url, relativePath, sources } = meta;
    const scopeMeta = type === "local" ? inferScopeFromRelativePath(relativePath) : { scope: "library", entityId: "", pageKey: "" };
    const cloudinaryId = type === "cloudinary" ? extractPublicIdFromCloudinaryUrl(url) : "";

    const existing = await mediaAssetExists({ url, relativePath, cloudinaryId });
    if (existing) {
      stats.skippedExisting++;
      if (VERBOSE) console.log(`  [var] ${type === "local" ? relativePath : url}`);
      continue;
    }

    let size = 0;
    let mimeType = "";
    let fileName = type === "local" ? fileNameFromPath(relativePath) : cloudinaryId.split("/").pop() || "cloudinary-file";

    if (type === "local") {
      const abs = absolutePathForRelative(relativePath);
      if (!fs.existsSync(abs)) {
        stats.skippedMissingFile++;
        console.log(`  [dosya yok] ${relativePath} (${[...sources].join(", ")})`);
        continue;
      }
      const stat = fs.statSync(abs);
      size = stat.size;
    } else {
      stats.cloudinaryUrls++;
    }

    const kind = kindFromPath(relativePath || fileName, mimeType);
    const doc = {
      fileName,
      originalName: fileName,
      url,
      relativePath: type === "local" ? relativePath : "",
      cloudinaryId,
      mimeType,
      size,
      kind,
      scope: scopeMeta.scope,
      entityId: scopeMeta.entityId,
      pageKey: scopeMeta.pageKey,
    };

    if (DRY_RUN) {
      console.log(`[dry-run] + MediaAsset  ${type === "local" ? relativePath : url}`);
      console.log(`          scope=${doc.scope} kind=${doc.kind} sources=${[...sources].join(",")}`);
      stats.created++;
      continue;
    }

    await MediaAsset.create(doc);
    stats.created++;
    console.log(`✓ ${type === "local" ? relativePath : url} (${[...sources].join(", ")})`);
  }

  console.log("\n=== ÖZET ===");
  console.log(`Benzersiz referans : ${stats.uniqueUrls}`);
  console.log(`Oluşturulan        : ${stats.created}`);
  console.log(`Zaten vardı        : ${stats.skippedExisting}`);
  console.log(`Dosya bulunamadı   : ${stats.skippedMissingFile}`);
  console.log(`Cloudinary URL     : ${stats.cloudinaryUrls}`);

  if (DRY_RUN) {
    console.log("\nGerçek oluşturma için: node src/backfill-media-assets.js --apply");
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
