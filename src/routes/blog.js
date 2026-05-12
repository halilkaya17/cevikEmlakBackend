const express = require("express");
const BlogPost = require("../models/BlogPost");
const { requireAuth } = require("../middleware/auth");
const { toSlug } = require("../utils/slug");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const query = req.query.all ? {} : { status: "published" };
    const posts = await BlogPost.find(query).sort({ createdAt: -1 });
    res.json({ posts });
  } catch (error) {
    next(error);
  }
});

router.get("/:slug", async (req, res, next) => {
  try {
    const slug = req.params.slug;
    const post = await BlogPost.findOne({ slug }).lean();
    if (!post) return res.status(404).json({ message: "Blog yazisi bulunamadi" });
    if (post.status !== "published") {
      return res.status(404).json({ message: "Blog yazisi bulunamadi" });
    }

    const ordered = await BlogPost.find({ status: "published" })
      .sort({ createdAt: -1 })
      .select("slug title")
      .lean();
    const idx = ordered.findIndex((p) => p.slug === slug);
    const prev =
      idx > 0 ? { slug: ordered[idx - 1].slug, title: ordered[idx - 1].title } : null;
    const next =
      idx >= 0 && idx < ordered.length - 1
        ? { slug: ordered[idx + 1].slug, title: ordered[idx + 1].title }
        : null;

    const body = {
      ...post,
      descriptionHtml: post.descriptionHtml || post.content || "",
    };

    return res.json({ post: body, prev, next });
  } catch (error) {
    return next(error);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const body = { ...req.body };
    delete body.category;
    const html = body.descriptionHtml ?? body.content ?? "";
    body.descriptionHtml = html;
    body.content = html;
    body.gallery = Array.isArray(body.gallery) ? body.gallery.filter(Boolean) : [];
    body.sectoralComment = body.sectoralComment && typeof body.sectoralComment === "object" ? body.sectoralComment : {};
    const post = await BlogPost.create({
      ...body,
      slug: body.slug || toSlug(body.title),
      publishedAt: body.status === "published" ? new Date() : null,
    });
    res.status(201).json({ post });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", requireAuth, async (req, res, next) => {
  try {
    const payload = { ...req.body };
    delete payload.category;
    if (payload.title && !payload.slug) payload.slug = toSlug(payload.title);
    if (payload.status === "published" && !payload.publishedAt) payload.publishedAt = new Date();
    if (payload.descriptionHtml !== undefined || payload.content !== undefined) {
      const html = payload.descriptionHtml ?? payload.content ?? "";
      payload.descriptionHtml = html;
      payload.content = html;
    }
    if (payload.gallery !== undefined) {
      payload.gallery = Array.isArray(payload.gallery) ? payload.gallery.filter(Boolean) : [];
    }
    if (payload.sectoralComment !== undefined && typeof payload.sectoralComment !== "object") {
      delete payload.sectoralComment;
    }
    const post = await BlogPost.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });
    if (!post) return res.status(404).json({ message: "Blog yazisi bulunamadi" });
    return res.json({ post });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    await BlogPost.findByIdAndDelete(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
