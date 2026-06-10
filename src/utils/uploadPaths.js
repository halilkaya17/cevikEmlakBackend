const mongoose = require("mongoose");

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

function isCloudinaryUrl(url) {
  return typeof url === "string" && /res\.cloudinary\.com/i.test(url);
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
    if (isCloudinaryUrl(value)) paths.add(value);
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

function collectPathsFromDocument(doc) {
  const paths = new Set();
  if (!doc) return paths;
  collectPathsFromValue(doc, paths);
  return paths;
}

function diffRemovedPaths(oldDoc, newDoc) {
  const oldPaths = collectPathsFromDocument(oldDoc);
  const newPaths = collectPathsFromDocument(newDoc);
  const removed = [];
  for (const rel of oldPaths) {
    if (!newPaths.has(rel)) removed.push(rel);
  }
  return removed;
}

module.exports = {
  normalizePathKey,
  extractUploadsRelativePath,
  isLocalUploadsUrl,
  isCloudinaryUrl,
  collectPathsFromValue,
  collectPathsFromDocument,
  diffRemovedPaths,
};
