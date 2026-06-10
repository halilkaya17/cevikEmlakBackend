/**
 * uploads/ altındaki boş klasörleri temizler.
 *
 * Kullanım:
 *   node src/cleanup-empty-upload-dirs.js --dry-run
 *   node src/cleanup-empty-upload-dirs.js --apply
 *
 * Not: Silme/güncelleme sonrası boş klasörler artık otomatik temizlenir (mediaStorage).
 * Bu script mevcut yetim boş klasörler için bakım amaçlıdır.
 */

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
  console.log("Boş upload klasörü temizliği");
  console.log(`  mod     : ${DRY_RUN ? "dry-run" : "uygula"}`);
  console.log(`  uploads : ${UPLOAD_DIR}\n`);

  if (!fs.existsSync(UPLOAD_DIR)) {
    console.log("uploads klasörü yok.");
    return;
  }

  const empty = findEmptyDirs(UPLOAD_DIR, UPLOAD_DIR).sort();
  console.log(`Boş klasör: ${empty.length}`);
  for (const rel of empty) {
    console.log(`  ${rel || "(kök)"}`);
  }

  if (!empty.length) {
    console.log("\nTemizlenecek boş klasör yok.");
    return;
  }

  if (DRY_RUN) {
    console.log("\nGerçek silme için: node src/cleanup-empty-upload-dirs.js --apply");
    return;
  }

  const removed = cleanupAllEmptyUploadDirs();
  console.log(`\nSilinen boş klasör: ${removed}`);
}

run();
