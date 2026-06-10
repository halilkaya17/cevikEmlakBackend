const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const OPTIMIZE_CONFIG = {
  enabled: true,
  image: {
    quality: 88,
    maxWidth: 2560,
    effort: 4,
  },
  video: {
    crf: 20,
    maxWidth: 1920,
    preset: "medium",
    audioBitrate: "128k",
    skipIfMp4UnderBytes: 15 * 1024 * 1024,
  },
  skipIfLarger: true,
};

const FFMPEG_BIN = "ffmpeg";
const FFPROBE_BIN = "ffprobe";

const SKIP_IMAGE_MIMES = new Set(["image/svg+xml", "image/gif"]);

let ffmpegMissingLogged = false;

function runProcess(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      if (err.code === "ENOENT") reject(Object.assign(new Error(`${bin} bulunamadi`), { code: "ENOENT" }));
      else reject(err);
    });

    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} cikis kodu ${code}: ${stderr.slice(-500)}`));
    });
  });
}

function unchanged(file) {
  return { buffer: file.buffer, mimeType: file.mimetype, newExt: null };
}

async function optimizeImage(buffer, mimeType) {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    console.warn("[mediaOptimize] sharp paketi yuklu degil, gorsel optimize atlandi");
    return null;
  }

  try {
    const meta = await sharp(buffer).metadata();
    const alreadyWebp = mimeType === "image/webp";
    const withinWidth = !meta.width || meta.width <= OPTIMIZE_CONFIG.image.maxWidth;

    if (alreadyWebp && withinWidth && buffer.length < 500 * 1024) {
      return null;
    }

    const output = await sharp(buffer)
      .rotate()
      .resize({
        width: OPTIMIZE_CONFIG.image.maxWidth,
        withoutEnlargement: true,
      })
      .webp({
        quality: OPTIMIZE_CONFIG.image.quality,
        effort: OPTIMIZE_CONFIG.image.effort,
        smartSubsample: true,
      })
      .toBuffer();

    if (OPTIMIZE_CONFIG.skipIfLarger && output.length >= buffer.length) {
      return null;
    }

    return { buffer: output, mimeType: "image/webp", newExt: ".webp" };
  } catch (err) {
    console.warn("[mediaOptimize] gorsel optimize basarisiz:", err.message);
    return null;
  }
}

async function probeVideo(inputPath) {
  try {
    const { stdout } = await runProcess(FFPROBE_BIN, [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width",
      "-of",
      "csv=p=0:s=x",
      inputPath,
    ]);
    const [codec, widthStr] = stdout.trim().split("x");
    return { codec: (codec || "").toLowerCase(), width: parseInt(widthStr, 10) || 0 };
  } catch {
    return null;
  }
}

async function shouldSkipVideoTranscode(inputPath, mimeType, size) {
  if (mimeType !== "video/mp4") return false;
  if (size > OPTIMIZE_CONFIG.video.skipIfMp4UnderBytes) return false;

  const probe = await probeVideo(inputPath);
  if (!probe) return false;

  return probe.codec === "h264" && probe.width > 0 && probe.width <= OPTIMIZE_CONFIG.video.maxWidth;
}

async function optimizeVideo(buffer, mimeType, originalName) {
  const tmpId = crypto.randomBytes(8).toString("hex");
  const inputExt = path.extname(originalName || "") || ".mp4";
  const inputPath = path.join(os.tmpdir(), `cevik-in-${tmpId}${inputExt}`);
  const outputPath = path.join(os.tmpdir(), `cevik-out-${tmpId}.mp4`);

  try {
    fs.writeFileSync(inputPath, buffer);

    if (await shouldSkipVideoTranscode(inputPath, mimeType, buffer.length)) {
      return null;
    }

    const scale = `scale='min(${OPTIMIZE_CONFIG.video.maxWidth},iw)':-2`;
    await runProcess(FFMPEG_BIN, [
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-c:v",
      "libx264",
      "-crf",
      String(OPTIMIZE_CONFIG.video.crf),
      "-preset",
      OPTIMIZE_CONFIG.video.preset,
      "-vf",
      scale,
      "-c:a",
      "aac",
      "-b:a",
      OPTIMIZE_CONFIG.video.audioBitrate,
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    const output = fs.readFileSync(outputPath);

    if (OPTIMIZE_CONFIG.skipIfLarger && output.length >= buffer.length) {
      return null;
    }

    return { buffer: output, mimeType: "video/mp4", newExt: ".mp4" };
  } catch (err) {
    if (err.code === "ENOENT") {
      if (!ffmpegMissingLogged) {
        console.warn("[mediaOptimize] ffmpeg bulunamadi, videolar orijinal kaydedilecek");
        ffmpegMissingLogged = true;
      }
    } else {
      console.warn("[mediaOptimize] video optimize basarisiz:", err.message);
    }
    return null;
  } finally {
    for (const p of [inputPath, outputPath]) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}

function applyNewExtension(fileName, newExt) {
  if (!newExt) return fileName;
  const base = fileName.replace(/\.[^.]+$/, "") || fileName;
  return `${base}${newExt}`;
}

/**
 * Upload buffer'ini optimize eder. Basarisiz veya atlanirsa null doner (orijinal kullanilir).
 * @returns {Promise<{ buffer: Buffer, mimeType: string, newExt: string|null }|null>}
 */
async function optimizeUploadedFile(file) {
  if (!OPTIMIZE_CONFIG.enabled || !file?.buffer?.length) {
    return null;
  }

  const mime = String(file.mimetype || "").toLowerCase();

  if (mime.startsWith("image/")) {
    if (SKIP_IMAGE_MIMES.has(mime)) return null;
    return optimizeImage(file.buffer, mime);
  }

  if (mime.startsWith("video/")) {
    return optimizeVideo(file.buffer, mime, file.originalname);
  }

  return null;
}

module.exports = {
  OPTIMIZE_CONFIG,
  optimizeUploadedFile,
  applyNewExtension,
};
