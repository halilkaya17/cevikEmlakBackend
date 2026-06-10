require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const { UPLOAD_DIR, cleanupAllEmptyUploadDirs } = require("./services/mediaStorage");

const args = new Set(process.argv.slice(2));
const DRY_RUN = !args.has("--apply");

function findEmptyDirs(dir, root, out = []) {
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      findEmptyDirs(path.join(dir, entry.name), root, out);
    }
  }

  if (dir !== root && fs.readdirSync(dir).length === 0) {
    out.push(path.relative(root, dir).split(path.sep).join("/"));
  }

  return out;
}

function run() {

  if (!fs.existsSync(UPLOAD_DIR)) {
    return;
  }

  const empty = findEmptyDirs(UPLOAD_DIR, UPLOAD_DIR).sort();
  for (const rel of empty) {
  }

  if (!empty.length) {
    return;
  }

  if (DRY_RUN) {
    return;
  }

  const removed = cleanupAllEmptyUploadDirs();
}

run();
