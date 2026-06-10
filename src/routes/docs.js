const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const DocCategory = require("../models/DocCategory");
const DocFile = require("../models/DocFile");
const MediaAsset = require("../models/MediaAsset");
const { requireAuth } = require("../middleware/auth");
const { saveUploadedFile, mediaKind } = require("../services/mediaStorage");
const { reconcileMediaOnDelete } = require("../services/mediaReconcile");

const router = express.Router();

router.get("/public", async (_req, res, next) => {
  try {
    const categories = await DocCategory.find().sort({ order: 1, createdAt: 1 }).lean();
    const out = await Promise.all(
      categories.map(async (cat) => {
        const files = await DocFile.find({ categoryId: cat._id })
          .sort({ createdAt: -1 })
          .select("name url originalName mimeType size")
          .lean();
        return {
          _id: String(cat._id),
          name: cat.name,
          files: files.map((f) => ({
            _id: String(f._id),
            name: f.name,
            url: f.url,
            originalName: f.originalName || "",
            mimeType: f.mimeType || "",
            size: f.size || 0,
          })),
        };
      }),
    );
    res.json({ categories: out });
  } catch (e) {
    next(e);
  }
});

router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

router.get("/categories", async (_req, res, next) => {
  try {
    const cats = await DocCategory.find().sort({ order: 1, createdAt: 1 });
    res.json({ categories: cats });
  } catch (e) { next(e); }
});

router.post("/categories", async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Kategori adı zorunludur" });
    const cat = await DocCategory.create({ name: name.trim() });
    return res.status(201).json({ category: cat });
  } catch (e) { return next(e); }
});

router.put("/categories/:id", async (req, res, next) => {
  try {
    const { name } = req.body;
    const cat = await DocCategory.findByIdAndUpdate(
      req.params.id,
      { name: name?.trim() },
      { new: true, runValidators: true },
    );
    if (!cat) return res.status(404).json({ message: "Kategori bulunamadı" });
    return res.json({ category: cat });
  } catch (e) { return next(e); }
});

router.delete("/categories/:id", async (req, res, next) => {
  try {
    const files = await DocFile.find({ categoryId: req.params.id }).lean();
    for (const file of files) {
      await reconcileMediaOnDelete(file, { excludeModel: "DocFile", excludeId: file._id });
    }
    await DocFile.deleteMany({ categoryId: req.params.id });
    await DocCategory.findByIdAndDelete(req.params.id);
    return res.status(204).end();
  } catch (e) { return next(e); }
});

router.get("/categories/:id/files", async (req, res, next) => {
  try {
    const files = await DocFile.find({ categoryId: req.params.id }).sort({ createdAt: -1 });
    res.json({ files });
  } catch (e) { next(e); }
});

router.post("/categories/:id/files", upload.single("file"), async (req, res, next) => {
  try {
    const cat = await DocCategory.findById(req.params.id);
    if (!cat) return res.status(404).json({ message: "Kategori bulunamadı" });

    const file = req.file;
    if (!file) return res.status(400).json({ message: "Dosya gereklidir" });

    const name = req.body.name?.trim() || file.originalname;
    const docId = new mongoose.Types.ObjectId();
    const saved = await saveUploadedFile(file, { scope: "doc", entityId: String(docId) });

    const doc = await DocFile.create({
      _id: docId,
      categoryId: req.params.id,
      name,
      url: saved.url,
      originalName: saved.originalName,
      mimeType: saved.mimeType,
      size: saved.size,
      cloudinaryId: saved.cloudinaryId,
    });

    await MediaAsset.create({
      _id: saved.assetId,
      fileName: saved.fileName,
      originalName: saved.originalName,
      url: saved.url,
      relativePath: saved.relativePath,
      cloudinaryId: saved.cloudinaryId,
      mimeType: saved.mimeType,
      size: saved.size,
      kind: saved.kind || mediaKind(saved.mimeType || ""),
      scope: saved.scope,
      entityId: String(docId),
      pageKey: saved.pageKey,
    });

    return res.status(201).json({ file: doc });
  } catch (e) {
    if (e.statusCode === 507 || e.code === "STORAGE_LIMIT_EXCEEDED") {
      return res.status(507).json({ error: e.message, code: e.code });
    }
    if (e.code === "UPLOAD_PERMISSION_DENIED") {
      return res.status(500).json({ error: e.message, code: e.code });
    }
    return next(e);
  }
});

router.put("/files/:id", async (req, res, next) => {
  try {
    const { name } = req.body;
    const doc = await DocFile.findByIdAndUpdate(req.params.id, { name: name?.trim() }, { new: true });
    if (!doc) return res.status(404).json({ message: "Dosya bulunamadı" });
    return res.json({ file: doc });
  } catch (e) { return next(e); }
});

router.delete("/files/:id", async (req, res, next) => {
  try {
    const doc = await DocFile.findById(req.params.id).lean();
    if (!doc) return res.status(404).end();
    await reconcileMediaOnDelete(doc, { excludeModel: "DocFile", excludeId: doc._id });
    await DocFile.findByIdAndDelete(req.params.id);
    return res.status(204).end();
  } catch (e) { return next(e); }
});

module.exports = router;
