const mongoose = require("mongoose");
const MediaAsset = require("../models/MediaAsset");
const Listing = require("../models/Listing");
const PageContent = require("../models/PageContent");
const BlogPost = require("../models/BlogPost");
const Agent = require("../models/Agent");
const DocFile = require("../models/DocFile");
const SssContent = require("../models/SssContent");
const {
  collectPathsFromDocument,
  collectPathsFromValue,
  isCloudinaryUrl,
  normalizePathKey,
} = require("../utils/uploadPaths");
const { deleteStoredFile, publicUrlForRelative } = require("./mediaStorage");

const CONTENT_MODELS = [
  [Listing, "Listing"],
  [PageContent, "PageContent"],
  [BlogPost, "BlogPost"],
  [Agent, "Agent"],
  [DocFile, "DocFile"],
  [SssContent, "SssContent"],
];

function pathKey(value) {
  if (typeof value !== "string") return null;
  if (value.includes("/uploads/")) {
    const match = value.match(/\/uploads\/([^?#]+)/i);
    if (!match) return null;
    return normalizePathKey(match[1]);
  }
  if (isCloudinaryUrl(value)) return value;
  return null;
}

async function collectGloballyReferencedKeys({ excludeModel, excludeId } = {}) {
  const keys = new Set();

  for (const [Model, label] of CONTENT_MODELS) {
    const query = {};
    if (excludeModel === label && excludeId && mongoose.Types.ObjectId.isValid(String(excludeId))) {
      query._id = { $ne: excludeId };
    }

    const docs = await Model.find(query).lean();
    for (const doc of docs) {
      const docPaths = collectPathsFromDocument(doc);
      for (const p of docPaths) keys.add(p);
    }
  }

  return keys;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function resolveStoredMediaMeta(key) {
  const asset = await MediaAsset.findOne({
    $or: [
      { relativePath: key },
      { url: { $regex: `/uploads/${escapeRegex(key)}([?#]|$)` } },
      { url: key },
      { cloudinaryId: key },
    ],
  }).lean();
  if (asset) {
    return {
      url: asset.url,
      cloudinaryId: asset.cloudinaryId,
      relativePath: asset.relativePath || key,
      mimeType: asset.mimeType,
      mediaAssetId: asset._id,
    };
  }

  const docFile = await DocFile.findOne({
    $or: [
      { url: key },
      { url: { $regex: `/uploads/${escapeRegex(key)}([?#]|$)` } },
      { cloudinaryId: key },
    ],
  }).lean();
  if (docFile) {
    return {
      url: docFile.url,
      cloudinaryId: docFile.cloudinaryId,
      relativePath: key,
      mimeType: docFile.mimeType,
      mediaAssetId: null,
    };
  }

  return {
    url: key.includes("://") || key.startsWith("/uploads/") ? key : publicUrlForRelative(key),
    cloudinaryId: "",
    relativePath: key.includes("://") ? "" : key,
    mimeType: "",
    mediaAssetId: null,
  };
}

async function deleteMediaIfUnreferenced(pathOrUrl, globalKeys) {
  const key = pathKey(pathOrUrl) || normalizePathKey(pathOrUrl);
  if (!key || globalKeys.has(key)) return false;

  const meta = await resolveStoredMediaMeta(key);
  await deleteStoredFile({
    url: meta.url,
    cloudinaryId: meta.cloudinaryId,
    relativePath: meta.relativePath,
    mimeType: meta.mimeType,
  });

  if (meta.mediaAssetId) {
    await MediaAsset.findByIdAndDelete(meta.mediaAssetId);
  }

  return true;
}
async function reconcileMediaOnUpdate(oldDoc, newDoc, { excludeModel, excludeId } = {}) {
  if (!oldDoc) return { removed: 0 };

  const removedKeys = [];
  const oldPaths = collectPathsFromDocument(oldDoc);
  const newPaths = collectPathsFromDocument(newDoc);

  for (const key of oldPaths) {
    if (!newPaths.has(key)) removedKeys.push(key);
  }

  if (!removedKeys.length) return { removed: 0 };

  const globalKeys = await collectGloballyReferencedKeys({ excludeModel, excludeId });
  for (const key of newPaths) globalKeys.add(key);

  let removed = 0;
  for (const key of removedKeys) {
    const deleted = await deleteMediaIfUnreferenced(key, globalKeys);
    if (deleted) removed++;
  }

  return { removed };
}

async function reconcileMediaOnDelete(doc, { excludeModel, excludeId } = {}) {
  if (!doc) return { removed: 0 };

  const docPaths = collectPathsFromDocument(doc);
  if (!docPaths.size) return { removed: 0 };

  const globalKeys = await collectGloballyReferencedKeys({
    excludeModel,
    excludeId: excludeId || doc._id,
  });

  let removed = 0;
  for (const key of docPaths) {
    const deleted = await deleteMediaIfUnreferenced(key, globalKeys);
    if (deleted) removed++;
  }

  return { removed };
}

async function deleteMediaAssetById(assetId) {
  const asset = await MediaAsset.findById(assetId).lean();
  if (!asset) return { deleted: false, reason: "not_found" };

  const key = pathKey(asset.url) || normalizePathKey(asset.relativePath);
  const globalKeys = await collectGloballyReferencedKeys();

  if (key && globalKeys.has(key)) {
    await MediaAsset.findByIdAndDelete(assetId);
    return { deleted: true, reason: "record_only_still_referenced" };
  }

  await deleteStoredFile({
    url: asset.url,
    cloudinaryId: asset.cloudinaryId,
    relativePath: asset.relativePath,
    mimeType: asset.mimeType,
  });
  await MediaAsset.findByIdAndDelete(assetId);
  return { deleted: true, reason: "file_and_record" };
}

module.exports = {
  collectGloballyReferencedKeys,
  reconcileMediaOnUpdate,
  reconcileMediaOnDelete,
  deleteMediaAssetById,
  collectPathsFromValue,
};
