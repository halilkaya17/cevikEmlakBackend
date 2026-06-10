require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");
const { Readable } = require("stream");

const UPLOAD_DIR = path.join(__dirname, "../uploads");
const PREFIX = (process.env.CLOUDINARY_PREFIX || "cevik-emlak").replace(/\/+$/, "");
const CONCURRENCY = Math.max(1, Number(process.env.CLOUDINARY_DOWNLOAD_CONCURRENCY) || 3);

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const FORCE = args.has("--force");

const RESOURCE_TYPES = ["image", "video", "raw"];

function cloudinaryV2() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY ve CLOUDINARY_API_SECRET .env içinde tanımlı olmalı.");
  }

  const { v2: cloudinary } = require("cloudinary");
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  return cloudinary;
}

function localPathForResource(resource) {
  const publicId = String(resource.public_id || "").trim();
  const format = String(resource.format || "").trim().replace(/^\./, "");
  if (!publicId) return null;

  const fileName = format ? `${publicId}.${format}` : publicId;
  return path.join(UPLOAD_DIR, fileName);
}

async function listAllResources(cloudinary, resourceType) {
  const items = [];
  let nextCursor;

  do {
    const result = await cloudinary.api.resources({
      resource_type: resourceType,
      type: "upload",
      prefix: PREFIX,
      max_results: 500,
      ...(nextCursor ? { next_cursor: nextCursor } : {}),
    });

    items.push(...(result.resources || []));
    nextCursor = result.next_cursor;
  } while (nextCursor);

  return items;
}

async function downloadToFile(url, destPath) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} — ${url}`);
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const body = response.body;
  if (!body) throw new Error("Boş response body");

  const nodeStream = Readable.fromWeb(body);
  await pipeline(nodeStream, fs.createWriteStream(destPath));
}

async function runPool(tasks, concurrency) {
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const current = index++;
      await tasks[current]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
}

async function run() {
  const cloudinary = cloudinaryV2();

  const allResources = [];

  for (const resourceType of RESOURCE_TYPES) {
    process.stdout.write(`${resourceType} listeleniyor... `);
    const list = await listAllResources(cloudinary, resourceType);
    for (const item of list) {
      allResources.push({ ...item, resource_type: resourceType });
    }
  }

  if (!allResources.length) {
    return;
  }

  const seen = new Set();
  const unique = [];
  for (const resource of allResources) {
    const key = `${resource.resource_type}:${resource.public_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(resource);
  }

  let skipped = 0;
  let downloaded = 0;
  let failed = 0;
  const failures = [];

  const tasks = unique.map((resource) => async () => {
    const dest = localPathForResource(resource);
    if (!dest) {
      failed++;
      failures.push({ public_id: resource.public_id, error: "public_id yok" });
      return;
    }

    const relative = path.relative(UPLOAD_DIR, dest);
    const url = resource.secure_url;

    if (!url) {
      failed++;
      failures.push({ public_id: resource.public_id, error: "secure_url yok" });
      return;
    }

    if (fs.existsSync(dest) && !FORCE) {
      skipped++;
      return;
    }

    if (DRY_RUN) {
      downloaded++;
      return;
    }

    try {
      await downloadToFile(url, dest);
      downloaded++;
    } catch (error) {
      failed++;
      failures.push({ public_id: resource.public_id, error: error.message });
    }
  });

  await runPool(tasks, CONCURRENCY);

  if (failures.length) {
    for (const item of failures.slice(0, 20)) {
    }
    if (failures.length > 20) {
    }
  }

  if (DRY_RUN) {
  }
}

run().catch((err) => {
  process.exit(1);
});
