const express = require("express");
const { Readable } = require("stream");
const MediaAsset = require("../models/MediaAsset");
const { requireAuth } = require("../middleware/auth");
const { upload, IMAGE_SIZE_LIMIT, VIDEO_SIZE_LIMIT } = require("../middleware/upload");

const router = express.Router();

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
    const isVideo = mimetype.startsWith("video/");
    const resourceType = isVideo ? "video" : "image";
    const ext = require("path").extname(originalname || "").replace(".", "");

    const options = {
      resource_type: resourceType,
      folder: "cevik-emlak",
      // Video için format belirtme: Cloudinary'nin kendi formatını seçmesine izin ver
      // ve büyük dosyalarda senkron dönüştürme hatasını önlemek için async kullan
      ...(isVideo
        ? { eager_async: true }
        : { format: ext || undefined }),
    };

    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    Readable.from(buffer).pipe(stream);
  });
}

/* ─── Helpers ─── */
function localPublicUrl(file) {
  if (file.location) return file.location;
  const base = process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 5001}`;
  return `${base}/uploads/${file.filename}`;
}

function mediaKind(mimeType) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.includes("pdf") || mimeType.includes("document")) return "document";
  return "other";
}

router.get("/", requireAuth, async (_req, res, next) => {
  try {
    const assets = await MediaAsset.find().sort({ createdAt: -1 });
    res.json({ assets });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, upload.array("files", 20), async (req, res, next) => {
  try {
    const files = req.files || [];
    const isCloudinary = process.env.STORAGE_DRIVER === "cloudinary";
    // ?save=false → sadece Cloudinary'e yükle, medya kütüphanesine kaydetme
    const saveToLibrary = req.query.save !== "false";

    // Tür bazlı boyut kontrolü
    for (const file of files) {
      const isVideo = file.mimetype.startsWith("video/");
      const limit = isVideo ? VIDEO_SIZE_LIMIT : IMAGE_SIZE_LIMIT;
      if (file.size > limit) {
        const mb = Math.round(limit / 1024 / 1024);
        return res.status(400).json({ error: `${file.originalname}: maksimum dosya boyutu ${mb} MB` });
      }
    }

    const assetDocs = await Promise.all(
      files.map(async (file) => {
        let url;
        if (isCloudinary) {
          const result = await uploadToCloudinary(file.buffer, file.mimetype, file.originalname);
          url = result.secure_url;
        } else {
          url = localPublicUrl(file);
        }
        return {
          fileName: file.filename || file.originalname,
          originalName: file.originalname,
          url,
          mimeType: file.mimetype,
          size: file.size,
          kind: mediaKind(file.mimetype || ""),
          type: file.mimetype.startsWith("video/") ? "video" : "image",
        };
      }),
    );

    const assets = saveToLibrary
      ? await MediaAsset.insertMany(assetDocs)
      : assetDocs;

    res.status(201).json({ assets });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    await MediaAsset.findByIdAndDelete(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
