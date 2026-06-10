require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { connectDatabase } = require("./config/db");
const BlogPost = require("./models/BlogPost");

const UPLOAD_DIR = path.join(__dirname, "../uploads");
const BLOGS_DIR = path.join(UPLOAD_DIR, "blogs");
const PUBLIC_BASE = (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/+$/, "");

const args = new Set(process.argv.slice(2));
const DRY_RUN = !args.has("--apply");
const VERBOSE = args.has("--verbose");

const stats = {
  blogsProcessed: 0,
  blogsUpdated: 0,
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

function blogFolderPrefix(blogId) {
  return `blogs/${blogId}/`;
}

function extractUploadUrlsFromHtml(html) {
  const urls = [];
  if (!html) return urls;

  const htmlRe = /(?:https?:\/\/[^"'\s]+)?\/uploads\/[^"'\s?#]+/gi;
  let match;
  while ((match = htmlRe.exec(html))) {
    let url = match[0];
    if (url.startsWith("/uploads/")) url = `${PUBLIC_BASE}${url}`;
    if (isLocalUploadsUrl(url)) urls.push(url);
  }
  return urls;
}

function collectUrlsFromBlog(blog) {
  const urls = [];

  const push = (url) => {
    if (isLocalUploadsUrl(url)) urls.push(url);
    else if (url && typeof url === "string" && url.includes("res.cloudinary.com")) stats.skippedExternal++;
  };

  push(blog.coverImage);
  for (const url of blog.gallery || []) push(url);
  for (const url of extractUploadUrlsFromHtml(blog.descriptionHtml)) push(url);
  for (const url of extractUploadUrlsFromHtml(blog.content)) push(url);

  return urls;
}

function buildRefCounts(blogs) {
  const counts = new Map();
  for (const blog of blogs) {
    const seen = new Set();
    for (const url of collectUrlsFromBlog(blog)) {
      const rel = extractUploadsRelativePath(url);
      if (!rel || seen.has(rel)) continue;
      seen.add(rel);
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

function resolveNewUrl(oldUrl, blogId, refCounts, cache) {
  if (!isLocalUploadsUrl(oldUrl)) return oldUrl;
  if (cache.has(oldUrl)) return cache.get(oldUrl);

  const rel = extractUploadsRelativePath(oldUrl);
  if (!rel) return oldUrl;

  const prefix = blogFolderPrefix(blogId);
  if (rel.startsWith(prefix)) {
    stats.alreadyInPlace++;
    cache.set(oldUrl, oldUrl);
    return oldUrl;
  }

  const srcPath = absolutePathForRelative(rel);
  if (!fs.existsSync(srcPath)) {
    stats.missingFile++;
    cache.set(oldUrl, oldUrl);
    return oldUrl;
  }

  const destDir = path.join(BLOGS_DIR, blogId);
  const { filename, destPath } = pickDestFilename(destDir, srcPath);
  const newRel = `${prefix}${filename}`;
  const newUrl = publicUrlForRelative(newRel);
  const copy = (refCounts.get(rel) || 0) > 1;

  if (DRY_RUN) {
  } else if (!fs.existsSync(destPath)) {
    transferFile(srcPath, destPath, copy);
  }

  cache.set(oldUrl, newUrl);
  if (newUrl !== oldUrl) stats.urlsUpdated++;
  return newUrl;
}

function replaceUrlsInHtml(html, cache) {
  if (!html) return html;
  let next = html;
  for (const [oldUrl, newUrl] of cache.entries()) {
    if (oldUrl !== newUrl) next = next.split(oldUrl).join(newUrl);
  }
  return next;
}

function transformBlog(blog, refCounts) {
  const blogId = String(blog._id);
  const cache = new Map();
  const next = blog.toObject();

  if (next.coverImage) {
    next.coverImage = resolveNewUrl(next.coverImage, blogId, refCounts, cache);
  }

  next.gallery = (next.gallery || []).map((url) => resolveNewUrl(url, blogId, refCounts, cache));

  if (next.descriptionHtml) {
    next.descriptionHtml = replaceUrlsInHtml(next.descriptionHtml, cache);
  }
  if (next.content) {
    next.content = replaceUrlsInHtml(next.content, cache);
  }

  return next;
}

function stableStringify(value) {
  return JSON.stringify(value);
}

async function run() {

  await connectDatabase();

  const blogs = await BlogPost.find({});

  const refCounts = buildRefCounts(blogs);

  for (const blog of blogs) {
    stats.blogsProcessed++;
    const before = stableStringify(blog.toObject());
    const afterObj = transformBlog(blog, refCounts);
    const after = stableStringify(afterObj);

    if (before === after) continue;

    stats.blogsUpdated++;

    if (DRY_RUN) {
      continue;
    }

    await BlogPost.replaceOne({ _id: blog._id }, afterObj);
  }

  if (DRY_RUN) {
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  try {
    await mongoose.disconnect();
  } catch {
  }
  process.exit(1);
});
