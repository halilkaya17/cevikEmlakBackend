/**
 * Danışman fotoğraflarını uploads/agents/{agentId}/ altına taşır ve DB günceller.
 *
 * Kapsam (Agent):
 *   photo
 *
 * Kullanım:
 *   node src/migrate-agent-media-folders.js --dry-run
 *   node src/migrate-agent-media-folders.js --apply
 *
 * Ortam: MONGODB_URI, PUBLIC_API_URL (.env)
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { connectDatabase } = require("./config/db");
const Agent = require("./models/Agent");

const UPLOAD_DIR = path.join(__dirname, "../uploads");
const AGENTS_DIR = path.join(UPLOAD_DIR, "agents");
const PUBLIC_BASE = (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/+$/, "");

const args = new Set(process.argv.slice(2));
const DRY_RUN = !args.has("--apply");
const VERBOSE = args.has("--verbose");

const stats = {
  agentsProcessed: 0,
  agentsUpdated: 0,
  filesMoved: 0,
  filesCopied: 0,
  urlsUpdated: 0,
  alreadyInPlace: 0,
  missingFile: 0,
  skippedExternal: 0,
};

function normalizePathKey(relativePath) {
  return String(relativePath || "")
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/")
    .normalize("NFC");
}

function extractUploadsRelativePath(value) {
  if (typeof value !== "string" || !value.includes("/uploads/")) return null;
  const match = value.match(/\/uploads\/([^?#]+)/i);
  if (!match) return null;
  return normalizePathKey(match[1].replace(/\\/g, "/"));
}

function isLocalUploadsUrl(url) {
  return typeof url === "string" && url.includes("/uploads/") && !url.includes("res.cloudinary.com");
}

function publicUrlForRelative(relativePath) {
  return `${PUBLIC_BASE}/uploads/${relativePath.split("/").join("/")}`;
}

function absolutePathForRelative(relativePath) {
  return path.join(UPLOAD_DIR, relativePath.split("/").join(path.sep));
}

function agentFolderPrefix(agentId) {
  return `agents/${agentId}/`;
}

function collectUrlsFromAgent(agent) {
  const urls = [];
  const photo = agent.photo;
  if (isLocalUploadsUrl(photo)) urls.push(photo);
  else if (photo && photo.includes("res.cloudinary.com")) stats.skippedExternal++;
  return urls;
}

function buildRefCounts(agents) {
  const counts = new Map();
  for (const agent of agents) {
    for (const url of collectUrlsFromAgent(agent)) {
      const rel = extractUploadsRelativePath(url);
      if (!rel) continue;
      counts.set(rel, (counts.get(rel) || 0) + 1);
    }
  }
  return counts;
}

function pickDestFilename(destDir, srcPath) {
  let filename = path.basename(srcPath);
  let destPath = path.join(destDir, filename);
  if (!fs.existsSync(destPath)) return { filename, destPath };

  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let n = 1;
  while (fs.existsSync(destPath)) {
    filename = `${base}_${n}${ext}`;
    destPath = path.join(destDir, filename);
    n++;
  }
  return { filename, destPath };
}

function transferFile(srcPath, destPath, copy) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  if (copy) {
    fs.copyFileSync(srcPath, destPath);
    stats.filesCopied++;
  } else {
    fs.renameSync(srcPath, destPath);
    stats.filesMoved++;
  }
}

function resolveNewUrl(oldUrl, agentId, refCounts, cache) {
  if (!isLocalUploadsUrl(oldUrl)) return oldUrl;
  if (cache.has(oldUrl)) return cache.get(oldUrl);

  const rel = extractUploadsRelativePath(oldUrl);
  if (!rel) return oldUrl;

  const prefix = agentFolderPrefix(agentId);
  if (rel.startsWith(prefix)) {
    stats.alreadyInPlace++;
    cache.set(oldUrl, oldUrl);
    return oldUrl;
  }

  const srcPath = absolutePathForRelative(rel);
  if (!fs.existsSync(srcPath)) {
    stats.missingFile++;
    if (VERBOSE) console.log(`    [dosya yok] ${rel}`);
    cache.set(oldUrl, oldUrl);
    return oldUrl;
  }

  const destDir = path.join(AGENTS_DIR, agentId);
  const { filename, destPath } = pickDestFilename(destDir, srcPath);
  const newRel = `${prefix}${filename}`;
  const newUrl = publicUrlForRelative(newRel);
  const copy = (refCounts.get(rel) || 0) > 1;

  if (DRY_RUN) {
    console.log(`    [dry-run] ${copy ? "kopyala" : "taşı"}: ${rel} → ${newRel}`);
  } else if (!fs.existsSync(destPath)) {
    transferFile(srcPath, destPath, copy);
  }

  cache.set(oldUrl, newUrl);
  if (newUrl !== oldUrl) stats.urlsUpdated++;
  return newUrl;
}

function transformAgent(agent, refCounts) {
  const agentId = String(agent._id);
  const cache = new Map();
  const next = agent.toObject();

  if (next.photo) {
    next.photo = resolveNewUrl(next.photo, agentId, refCounts, cache);
  }

  return next;
}

function stableStringify(value) {
  return JSON.stringify(value);
}

async function run() {
  console.log("Danışman fotoğraflarını agents/{id}/ altına taşıma");
  console.log(`  mod         : ${DRY_RUN ? "dry-run" : "uygula"}`);
  console.log(`  PUBLIC_BASE : ${PUBLIC_BASE}`);
  console.log(`  hedef       : ${AGENTS_DIR}\n`);

  await connectDatabase();

  const agents = await Agent.find({});
  console.log(`Toplam danışman: ${agents.length}\n`);

  const refCounts = buildRefCounts(agents);
  console.log(`Benzersiz local foto yolu: ${refCounts.size}\n`);

  for (const agent of agents) {
    stats.agentsProcessed++;
    const before = stableStringify(agent.toObject());
    const afterObj = transformAgent(agent, refCounts);
    const after = stableStringify(afterObj);

    if (before === after) continue;

    stats.agentsUpdated++;

    const label = agent.fullName || agent.name || agent._id;
    if (DRY_RUN) {
      console.log(`[dry-run] Agent ${agent._id} (${label})`);
      continue;
    }

    await Agent.replaceOne({ _id: agent._id }, afterObj);
    console.log(`✓ Agent ${agent._id} (${label})`);
  }

  const legacyDir = path.join(UPLOAD_DIR, "cevik-emlak", "agents");
  if (!DRY_RUN && fs.existsSync(legacyDir)) {
    const remaining = fs.readdirSync(legacyDir);
    if (remaining.length === 0) {
      fs.rmdirSync(legacyDir);
      console.log("\nBoş kalan cevik-emlak/agents/ klasörü silindi.");
    } else if (remaining.length > 0) {
      console.log(`\nNot: cevik-emlak/agents/ içinde ${remaining.length} dosya kaldı (DB'de referans yok olabilir).`);
    }
  }

  console.log("\n=== ÖZET ===");
  console.log(`İşlenen danışman  : ${stats.agentsProcessed}`);
  console.log(`Güncellenen       : ${stats.agentsUpdated}`);
  console.log(`Güncellenen URL   : ${stats.urlsUpdated}`);
  console.log(`Taşınan dosya     : ${stats.filesMoved}`);
  console.log(`Kopyalanan dosya  : ${stats.filesCopied}`);
  console.log(`Zaten doğru klasör: ${stats.alreadyInPlace}`);
  console.log(`Dosya bulunamadı  : ${stats.missingFile}`);
  console.log(`Cloudinary (atlandı): ${stats.skippedExternal}`);

  if (DRY_RUN) {
    console.log("\nGerçek taşıma için: node src/migrate-agent-media-folders.js --apply");
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("\nHata:", err.message || err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
