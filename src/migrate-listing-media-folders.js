/**
 * İlan medyalarını uploads/listings/{listingId}/ altına taşır ve DB URL'lerini günceller.
 *
 * Kapsam (Listing):
 *   images, documents, floorPlans.images, contentGallery, description (HTML)
 *
 * Kullanım:
 *   node src/migrate-listing-media-folders.js --dry-run   # sadece plan (varsayılan)
 *   node src/migrate-listing-media-folders.js --apply      # taşı + DB güncelle
 *   node src/migrate-listing-media-folders.js --apply --verbose
 *
 * Ortam: MONGODB_URI, PUBLIC_API_URL (.env)
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { connectDatabase } = require("./config/db");
const Listing = require("./models/Listing");

const UPLOAD_DIR = path.join(__dirname, "../uploads");
const LISTINGS_DIR = path.join(UPLOAD_DIR, "listings");
const PUBLIC_BASE = (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/+$/, "");

const args = new Set(process.argv.slice(2));
const DRY_RUN = !args.has("--apply");
const VERBOSE = args.has("--verbose");

const stats = {
  listingsProcessed: 0,
  listingsUpdated: 0,
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

function listingFolderPrefix(listingId) {
  return `listings/${listingId}/`;
}

function collectUrlsFromListing(listing) {
  const urls = [];

  const push = (url) => {
    if (isLocalUploadsUrl(url)) urls.push(url);
    else if (url && typeof url === "string" && url.includes("res.cloudinary.com")) stats.skippedExternal++;
  };

  for (const img of listing.images || []) push(img.url);
  for (const doc of listing.documents || []) push(doc.url);
  for (const fp of listing.floorPlans || []) {
    for (const img of fp.images || []) push(img.url);
  }
  for (const item of listing.contentGallery || []) push(item.url);

  const html = listing.description || "";
  const htmlRe = /(?:https?:\/\/[^"'\s]+)?\/uploads\/[^"'\s?#]+/gi;
  let match;
  while ((match = htmlRe.exec(html))) {
    let url = match[0];
    if (url.startsWith("/uploads/")) url = `${PUBLIC_BASE}${url}`;
    push(url);
  }

  return urls;
}

function buildRefCounts(listings) {
  const counts = new Map();
  for (const listing of listings) {
    const seen = new Set();
    for (const url of collectUrlsFromListing(listing)) {
      const rel = extractUploadsRelativePath(url);
      if (!rel || seen.has(rel)) continue;
      seen.add(rel);
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

function resolveNewUrl(oldUrl, listingId, refCounts, cache) {
  if (!isLocalUploadsUrl(oldUrl)) return oldUrl;
  if (cache.has(oldUrl)) return cache.get(oldUrl);

  const rel = extractUploadsRelativePath(oldUrl);
  if (!rel) return oldUrl;

  const prefix = listingFolderPrefix(listingId);
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

  const destDir = path.join(LISTINGS_DIR, listingId);
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

function transformListing(listing, refCounts) {
  const listingId = String(listing._id);
  const cache = new Map();
  const next = listing.toObject({ flattenMaps: true });

  next.images = (next.images || []).map((img) => ({
    ...img,
    url: resolveNewUrl(img.url, listingId, refCounts, cache),
  }));

  next.documents = (next.documents || []).map((doc) => ({
    ...doc,
    url: resolveNewUrl(doc.url, listingId, refCounts, cache),
  }));

  next.floorPlans = (next.floorPlans || []).map((fp) => ({
    ...fp,
    images: (fp.images || []).map((img) => ({
      ...img,
      url: resolveNewUrl(img.url, listingId, refCounts, cache),
    })),
  }));

  next.contentGallery = (next.contentGallery || []).map((item) => ({
    ...item,
    url: resolveNewUrl(item.url, listingId, refCounts, cache),
  }));

  if (next.description) {
    let html = next.description;
    for (const [oldUrl, newUrl] of cache.entries()) {
      if (oldUrl !== newUrl) {
        html = html.split(oldUrl).join(newUrl);
      }
    }
    next.description = html;
  }

  return next;
}

function stableStringify(value) {
  return JSON.stringify(value, (_key, v) => (v instanceof Map ? Object.fromEntries(v) : v));
}

async function run() {
  console.log("İlan medyalarını listings/{id}/ altına taşıma");
  console.log(`  mod         : ${DRY_RUN ? "dry-run" : "uygula"}`);
  console.log(`  PUBLIC_BASE : ${PUBLIC_BASE}`);
  console.log(`  hedef       : ${LISTINGS_DIR}\n`);

  await connectDatabase();

  const listings = await Listing.find({});
  console.log(`Toplam ilan: ${listings.length}\n`);

  const refCounts = buildRefCounts(listings);
  console.log(`Benzersiz local medya yolu: ${refCounts.size}\n`);

  for (const listing of listings) {
    stats.listingsProcessed++;
    const before = stableStringify(listing.toObject({ flattenMaps: true }));
    const afterObj = transformListing(listing, refCounts);
    const after = stableStringify(afterObj);

    if (before === after) continue;

    stats.listingsUpdated++;

    if (DRY_RUN) {
      console.log(`[dry-run] Listing ${listing._id} (${listing.listingNo || listing.slug})`);
      continue;
    }

    await Listing.replaceOne({ _id: listing._id }, afterObj);
    console.log(`✓ Listing ${listing._id} (${listing.listingNo || listing.slug})`);
  }

  console.log("\n=== ÖZET ===");
  console.log(`İşlenen ilan       : ${stats.listingsProcessed}`);
  console.log(`Güncellenen ilan   : ${stats.listingsUpdated}`);
  console.log(`Güncellenen URL    : ${stats.urlsUpdated}`);
  console.log(`Taşınan dosya      : ${stats.filesMoved}`);
  console.log(`Kopyalanan dosya   : ${stats.filesCopied}`);
  console.log(`Zaten doğru klasör : ${stats.alreadyInPlace}`);
  console.log(`Dosya bulunamadı   : ${stats.missingFile}`);
  console.log(`Cloudinary (atlandı): ${stats.skippedExternal}`);

  if (DRY_RUN) {
    console.log("\nGerçek taşıma için: node src/migrate-listing-media-folders.js --apply");
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
