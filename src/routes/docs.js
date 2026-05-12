const express = require("express");
const { Readable } = require("stream");
const multer = require("multer");
const DocCategory = require("../models/DocCategory");
const DocFile = require("../models/DocFile");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/* ─── Herkese açık okuma (site /sertifikalar) ─── */
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

/* ─── Cloudinary ─── */
function cloudinaryV2() {
  const { v2: cloudinary } = require("cloudinary");
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dqsuchxee",
    api_key: process.env.CLOUDINARY_API_KEY || "922416189361868",
    api_secret: process.env.CLOUDINARY_API_SECRET || "-hBd3q-NlhaV_f4FHGDETOkomxc",
  });
  return cloudinary;
}

function uploadToCloudinary(buffer, mimetype, originalname) {
  return new Promise((resolve, reject) => {
    const cloudinary = cloudinaryV2();
    let resourceType = "raw";
    if (mimetype.startsWith("image/")) resourceType = "image";
    else if (mimetype.startsWith("video/")) resourceType = "video";

    const opts = {
      resource_type: resourceType,
      folder: "cevik-emlak/docs",
      use_filename: true,
      unique_filename: true,
    };
    if (resourceType === "video") opts.eager_async = true;

    const stream = cloudinary.uploader.upload_stream(opts, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    Readable.from(buffer).pipe(stream);
  });
}

/* Dosya yükleme için memory storage */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

/* ════════════════════════════════════════
   KATEGORİLER
════════════════════════════════════════ */

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
    await DocFile.deleteMany({ categoryId: req.params.id });
    await DocCategory.findByIdAndDelete(req.params.id);
    return res.status(204).end();
  } catch (e) { return next(e); }
});

/* ════════════════════════════════════════
   DOSYALAR
════════════════════════════════════════ */

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
    const isCloudinary = process.env.STORAGE_DRIVER === "cloudinary";

    let url = "";
    let cloudinaryId = "";

    if (isCloudinary) {
      const result = await uploadToCloudinary(file.buffer, file.mimetype, file.originalname);
      url = result.secure_url;
      cloudinaryId = result.public_id;
    } else {
      url = `/uploads/${file.filename || file.originalname}`;
    }

    const doc = await DocFile.create({
      categoryId: req.params.id,
      name,
      url,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      cloudinaryId,
    });

    return res.status(201).json({ file: doc });
  } catch (e) { return next(e); }
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
    await DocFile.findByIdAndDelete(req.params.id);
    return res.status(204).end();
  } catch (e) { return next(e); }
});

module.exports = router;
