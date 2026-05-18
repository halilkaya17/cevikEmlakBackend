const path = require("path");
const multer = require("multer");
const multerS3 = require("multer-s3");
const { S3Client } = require("@aws-sdk/client-s3");

const IMAGE_SIZE_LIMIT = 20 * 1024 * 1024;   // 20 MB
const VIDEO_SIZE_LIMIT = 150 * 1024 * 1024;  // 150 MB

function fileName(file) {
  const ext = path.extname(file.originalname || "");
  const base = path
    .basename(file.originalname || "upload", ext)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${Date.now()}-${base || "file"}${ext}`;
}

function fileSizeFilter(_req, file, cb) {
  const isVideo = file.mimetype.startsWith("video/");
  if (!isVideo && !file.mimetype.startsWith("image/") && !file.mimetype.includes("pdf")) {
    return cb(new Error("Desteklenmeyen dosya türü"));
  }
  // Boyut limiti multer options'tan geliyor; burada tür bazlı reddetme
  // büyük video isteği route'ta kontrol edilir (buffer.length > VIDEO_SIZE_LIMIT)
  cb(null, true);
}

function makeUpload() {
  if (process.env.STORAGE_DRIVER === "s3") {
    const s3 = new S3Client({ region: process.env.AWS_REGION });
    return multer({
      storage: multerS3({
        s3,
        bucket: process.env.AWS_S3_BUCKET,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: (_req, file, cb) => cb(null, `cevik-emlak/${fileName(file)}`),
      }),
      fileFilter: fileSizeFilter,
      limits: { fileSize: VIDEO_SIZE_LIMIT },
    });
  }

  if (process.env.STORAGE_DRIVER === "cloudinary") {
    return multer({
      storage: multer.memoryStorage(),
      fileFilter: fileSizeFilter,
      limits: { fileSize: VIDEO_SIZE_LIMIT },
    });
  }

  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, path.join(__dirname, "../../uploads")),
      filename: (_req, file, cb) => cb(null, fileName(file)),
    }),
    fileFilter: fileSizeFilter,
    limits: { fileSize: VIDEO_SIZE_LIMIT },
  });
}

module.exports = { upload: makeUpload(), IMAGE_SIZE_LIMIT, VIDEO_SIZE_LIMIT };
