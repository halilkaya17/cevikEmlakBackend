const crypto = require("crypto");
const { assertStorageAvailable } = require("./storageQuota");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const mongoose = require("mongoose");
const {
  extractUploadsRelativePath,
  isCloudinaryUrl,
  isLocalUploadsUrl,
} = require("../utils/uploadPaths");
const { optimizeUploadedFile, applyNewExtension } = require("./mediaOptimize");

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, "../../uploads");
const PUBLIC_BASE = (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/+$/, "");

const UPLOAD_SUBDIRS = ["listings", "blogs", "agents", "docs", "pages", "media", "sss", "sss/banner"];

const VALID_SCOPES = new Set(["library", "listing", "blog", "agent", "page", "doc", "sss"]);

function storageDriver() {
  return process.env.STORAGE_DRIVER || "local";
}

function sanitizeFileName(originalname) {
  const ext = path.extname(originalname || "");
  const base = path
    .basename(originalname || "upload", ext)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${Date.now()}-${base || "file"}${ext}`;
}

function resolveRelativeDir(scope, { entityId, pageKey, assetId }) {
  switch (scope) {
    case "listing":
      return `listings/${entityId}`;
    case "blog":
      return `blogs/${entityId}`;
    case "agent":
      return `agents/${entityId}`;
    case "doc":
      return `docs/${entityId}`;
    case "page":
      return `pages/${pageKey || entityId}`;
    case "sss":
      return "sss/banner";
    default:
      return `media/${assetId}`;
  }
}

function publicUrlForRelative(relativePath) {
  return `${PUBLIC_BASE}/uploads/${relativePath.split("/").join("/")}`;
}

function absolutePathForRelative(relativePath) {
  return path.join(UPLOAD_DIR, relativePath.split("/").join(path.sep));
}

function mediaKind(mimeType) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.includes("pdf") || mimeType.includes("document")) return "document";
  return "other";
}

function cloudinaryV2() {
  const { v2: cloudinary } = require("cloudinary");
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  return cloudinary;
}

function uploadToCloudinary(buffer, mimetype, originalname, folder) {
  return new Promise((resolve, reject) => {
    const cloudinary = cloudinaryV2();
    const isVideo = mimetype.startsWith("video/");
    const resourceType = isVideo ? "video" : mimetype.includes("pdf") ? "raw" : "image";
    const ext = path.extname(originalname || "").replace(".", "");

    const options = {
      resource_type: resourceType,
      folder,
      use_filename: true,
      unique_filename: true,
      ...(isVideo ? { eager_async: true } : { format: ext || undefined }),
    };

    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    Readable.from(buffer).pipe(stream);
  });
}

function signCloudinaryDestroy({ publicId, timestamp, invalidate }, apiSecret) {
  const base = `invalidate=${invalidate}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  return crypto.createHash("sha1").update(base).digest("hex");
}

async function deleteFromCloudinary(publicId, resourceType = "image") {
  if (!publicId) return false;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return false;

  const timestamp = Math.floor(Date.now() / 1000);
  const invalidate = "true";
  const signature = signCloudinaryDestroy({ publicId, timestamp, invalidate }, apiSecret);
  const body = new URLSearchParams({
    public_id: publicId,
    api_key: apiKey,
    timestamp: String(timestamp),
    invalidate,
    signature,
  });

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || "Cloudinary silme basarisiz");
  }

  return true;
}

function deleteLocalRelativePath(relativePath) {
  if (!relativePath) return false;
  const abs = absolutePathForRelative(relativePath);
  if (!fs.existsSync(abs)) return false;
  fs.unlinkSync(abs);
  cleanupEmptyDirsFromRelativePath(relativePath);
  return true;
}
function cleanupEmptyDirsFromRelativePath(relativePath) {
  if (!relativePath || relativePath.includes("://")) return;

  const uploadRoot = path.resolve(UPLOAD_DIR);
  let dir = path.dirname(absolutePathForRelative(relativePath));

  while (dir.startsWith(uploadRoot) && dir !== uploadRoot) {
    try {
      if (!fs.existsSync(dir)) break;
      const entries = fs.readdirSync(dir);
      if (entries.length > 0) break;
      fs.rmdirSync(dir);
      dir = path.dirname(dir);
    } catch {
      break;
    }
  }
}

function cleanupAllEmptyUploadDirs() {
  const uploadRoot = path.resolve(UPLOAD_DIR);
  if (!fs.existsSync(uploadRoot)) return 0;

  let removed = 0;
  let changed = true;

  while (changed) {
    changed = false;
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(dir, entry.name));
      }
      if (dir === uploadRoot) return;
      try {
        if (fs.readdirSync(dir).length === 0) {
          fs.rmdirSync(dir);
          removed++;
          changed = true;
        }
      } catch {
      }
    };
    walk(uploadRoot);
  }

  return removed;
}

function mkdirUploadDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    if (err.code === "EPERM" || err.code === "EACCES") {
      const error = new Error(
        `Upload klasörüne yazılamıyor: ${dir}. Sunucuda Node/IIS uygulama kullanıcısının uploads/ altına yazma izni olmalı.`,
      );
      error.code = "UPLOAD_PERMISSION_DENIED";
      error.statusCode = 500;
      throw error;
    }
    throw err;
  }
}

function ensureUploadStructure() {
  mkdirUploadDir(UPLOAD_DIR);
  for (const sub of UPLOAD_SUBDIRS) {
    mkdirUploadDir(path.join(UPLOAD_DIR, sub));
  }
}

function writeLocalFile(abs, buffer) {
  try {
    fs.writeFileSync(abs, buffer);
  } catch (err) {
    if (err.code === "EPERM" || err.code === "EACCES") {
      const error = new Error(
        `Dosya yazılamıyor: ${abs}. uploads/ klasörü izinlerini kontrol edin.`,
      );
      error.code = "UPLOAD_PERMISSION_DENIED";
      error.statusCode = 500;
      throw error;
    }
    throw err;
  }
}

function parseScopeParams(query = {}) {
  const scope = VALID_SCOPES.has(query.scope) ? query.scope : "library";
  const entityId = String(query.entityId || "").trim();
  const pageKey = String(query.pageKey || "").trim();

  if (scope !== "library" && scope !== "sss" && scope !== "page" && !entityId) {
    throw new Error(`scope=${scope} için entityId zorunludur`);
  }
  if (scope === "page" && !pageKey && !entityId) {
    throw new Error("scope=page için pageKey zorunludur");
  }

  return { scope, entityId, pageKey };
}

async function saveUploadedFile(file, scopeParams = {}) {
  const { scope, entityId, pageKey } = parseScopeParams(scopeParams);
  const assetId = new mongoose.Types.ObjectId();
  let fileName = sanitizeFileName(file.originalname);
  const driver = storageDriver();

  if (driver === "cloudinary") {
    const folder = resolveRelativeDir(scope, { entityId, pageKey, assetId: String(assetId) });
    const result = await uploadToCloudinary(file.buffer, file.mimetype, file.originalname, folder);
    return {
      assetId,
      url: result.secure_url,
      relativePath: "",
      cloudinaryId: result.public_id,
      fileName: result.public_id.split("/").pop() || fileName,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      kind: mediaKind(file.mimetype || ""),
      scope,
      entityId: entityId || "",
      pageKey: pageKey || "",
    };
  }

  let buffer = file.buffer;
  let mimeType = file.mimetype;
  let size = file.size || 0;

  const optimized = await optimizeUploadedFile(file);
  if (optimized) {
    buffer = optimized.buffer;
    mimeType = optimized.mimeType;
    size = buffer.length;
    if (optimized.newExt) {
      fileName = applyNewExtension(fileName, optimized.newExt);
    }
  }

  await assertStorageAvailable(size);

  const relativeDir = resolveRelativeDir(scope, { entityId, pageKey, assetId: String(assetId) });
  const relativePath = `${relativeDir}/${fileName}`;
  const abs = absolutePathForRelative(relativePath);

  mkdirUploadDir(path.dirname(abs));
  writeLocalFile(abs, buffer);

  return {
    assetId,
    url: publicUrlForRelative(relativePath),
    relativePath,
    cloudinaryId: "",
    fileName,
    originalName: file.originalname,
    mimeType,
    size,
    kind: mediaKind(mimeType || ""),
    scope,
    entityId: entityId || "",
    pageKey: pageKey || "",
  };
}

async function deleteStoredFile({ url, cloudinaryId, relativePath, mimeType }) {
  let deleted = false;

  if (storageDriver() === "cloudinary" || isCloudinaryUrl(url) || cloudinaryId) {
    const publicId = cloudinaryId || extractPublicIdFromCloudinaryUrl(url);
    const resourceType = mimeType?.startsWith("video/") ? "video" : mimeType?.includes("pdf") ? "raw" : "image";
    if (publicId) {
      await deleteFromCloudinary(publicId, resourceType);
      deleted = true;
    }
  }

  const rel = relativePath || extractUploadsRelativePath(url);
  if (rel && (storageDriver() !== "cloudinary" || isLocalUploadsUrl(url))) {
    deleted = deleteLocalRelativePath(rel) || deleted;
  }

  return deleted;
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

module.exports = {
  UPLOAD_DIR,
  PUBLIC_BASE,
  VALID_SCOPES,
  sanitizeFileName,
  resolveRelativeDir,
  publicUrlForRelative,
  parseScopeParams,
  saveUploadedFile,
  deleteStoredFile,
  deleteLocalRelativePath,
  cleanupEmptyDirsFromRelativePath,
  cleanupAllEmptyUploadDirs,
  deleteFromCloudinary,
  ensureUploadStructure,
  mediaKind,
};
