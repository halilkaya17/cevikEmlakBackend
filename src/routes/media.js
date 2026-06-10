const express = require("express");
const multer = require("multer");
const path = require("path");
const MediaAsset = require("../models/MediaAsset");
const { requireAuth } = require("../middleware/auth");
const { IMAGE_SIZE_LIMIT, VIDEO_SIZE_LIMIT, DOCUMENT_SIZE_LIMIT } = require("../middleware/upload");
const { saveUploadedFile, mediaKind } = require("../services/mediaStorage");
const { deleteMediaAssetById } = require("../services/mediaReconcile");
const { getStorageQuota } = require("../services/storageQuota");

const DOCUMENT_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".rtf", ".odt", ".ods",
]);

function isAllowedMediaUpload(file) {
  const mime = String(file.mimetype || "").toLowerCase();
  const ext = path.extname(file.originalname || "").toLowerCase();

  if (mime.startsWith("image/") || mime.startsWith("video/")) return true;
  if (mime.includes("pdf") || ext === ".pdf") return true;

  const docMimeHints = [
    "msword",
    "wordprocessingml",
    "spreadsheetml",
    "excel",
    "powerpoint",
    "presentationml",
    "text/plain",
    "text/csv",
    "application/rtf",
    "opendocument",
  ];
  if (docMimeHints.some((hint) => mime.includes(hint))) return true;
  if (DOCUMENT_EXTENSIONS.has(ext)) return true;
  if (mime === "application/octet-stream" && DOCUMENT_EXTENSIONS.has(ext)) return true;

  return false;
}

function uploadSizeLimit(file) {
  if (file.mimetype.startsWith("video/")) return VIDEO_SIZE_LIMIT;
  if (file.mimetype.startsWith("image/")) return IMAGE_SIZE_LIMIT;
  return DOCUMENT_SIZE_LIMIT;
}

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_SIZE_LIMIT },
  fileFilter: (_req, file, cb) => {
    const ok = isAllowedMediaUpload(file);
    cb(ok ? null : new Error("Desteklenmeyen dosya türü"), ok);
  },
});

router.get("/", requireAuth, async (_req, res, next) => {
  try {
    const assets = await MediaAsset.find().sort({ createdAt: -1 });
    res.json({ assets });
  } catch (error) {
    next(error);
  }
});

router.get("/quota", requireAuth, async (_req, res, next) => {
  try {
    const quota = await getStorageQuota();
    res.json({ quota });
  } catch (error) {
    next(error);
  }
});
router.post("/", requireAuth, upload.array("files", 20), async (req, res, next) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: "Dosya gereklidir" });

    for (const file of files) {
      const limit = uploadSizeLimit(file);
      if (file.size > limit) {
        const mb = Math.round(limit / 1024 / 1024);
        return res.status(400).json({ error: `${file.originalname}: maksimum dosya boyutu ${mb} MB` });
      }
    }

    const scopeParams = {
      scope: req.query.scope,
      entityId: req.query.entityId,
      pageKey: req.query.pageKey,
    };

    const assets = [];
    for (const file of files) {
      const saved = await saveUploadedFile(file, scopeParams);
      const asset = await MediaAsset.create({
        _id: saved.assetId,
        fileName: saved.fileName,
        originalName: saved.originalName,
        url: saved.url,
        relativePath: saved.relativePath,
        cloudinaryId: saved.cloudinaryId,
        mimeType: saved.mimeType,
        size: saved.size,
        kind: saved.kind || mediaKind(file.mimetype || ""),
        scope: saved.scope,
        entityId: saved.entityId,
        pageKey: saved.pageKey,
      });
      assets.push(asset);
    }

    res.status(201).json({ assets });
  } catch (error) {
    if (error.statusCode === 507 || error.code === "STORAGE_LIMIT_EXCEEDED") {
      return res.status(507).json({ error: error.message, code: error.code });
    }
    if (error.code === "UPLOAD_PERMISSION_DENIED") {
      return res.status(500).json({ error: error.message, code: error.code });
    }
    if (error.message?.includes("entityId") || error.message?.includes("pageKey")) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const result = await deleteMediaAssetById(req.params.id);
    if (!result.deleted) return res.status(404).end();
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
