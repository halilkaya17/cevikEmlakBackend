const path = require("path");
const multer = require("multer");
const multerS3 = require("multer-s3");
const { S3Client } = require("@aws-sdk/client-s3");

function fileName(file) {
  const ext = path.extname(file.originalname || "");
  const base = path
    .basename(file.originalname || "upload", ext)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${Date.now()}-${base || "file"}${ext}`;
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
      limits: { fileSize: 200 * 1024 * 1024 },
    });
  }

  if (process.env.STORAGE_DRIVER === "cloudinary") {
    // Cloudinary için önce memory'e al, sonra media route'ta yükle
    return multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 200 * 1024 * 1024 },
    });
  }

  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, path.join(__dirname, "../../uploads")),
      filename: (_req, file, cb) => cb(null, fileName(file)),
    }),
    limits: { fileSize: 200 * 1024 * 1024 },
  });
}

module.exports = { upload: makeUpload() };
