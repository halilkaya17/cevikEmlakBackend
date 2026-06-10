const express = require("express");
const Icon = require("../models/Icon");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function sanitizeRawSvg(raw) {
  if (!raw || typeof raw !== "string") return null;
  return raw.replace(/<script[\s\S]*?<\/script>/gi, "").trim() || null;
}

function formatIcon(icon) {
  return {
    key:           icon.key,
    label:         icon.label,
    paths:         icon.paths || [],
    stroke:        icon.stroke,
    viewBox:       icon.viewBox       || null,
    fillRule:      icon.fillRule      || null,
    rawSvgContent: icon.rawSvgContent || null,
  };
}

router.get("/", async (_req, res, next) => {
  try {
    const icons = await Icon.find().sort({ key: 1 }).select("-__v -createdAt -updatedAt");
    res.set("Cache-Control", "public, max-age=300");
    res.json({ icons: icons.map(formatIcon) });
  } catch (err) {
    next(err);
  }
});

router.post("/seed", requireAuth, async (req, res, next) => {
  try {
    const items = Array.isArray(req.body.icons) ? req.body.icons : [];
    if (!items.length) return res.json({ count: 0 });

    const ops = items.map((icon) => ({
      updateOne: {
        filter: { key: icon.key },
        update: {
          $set: {
            label:         icon.label,
            paths:         icon.paths || [],
            stroke:        icon.stroke ?? true,
            viewBox:       icon.viewBox       || null,
            fillRule:      icon.fillRule      || null,
            rawSvgContent: sanitizeRawSvg(icon.rawSvgContent),
          },
        },
        upsert: true,
      },
    }));

    const result = await Icon.bulkWrite(ops, { ordered: false });
    return res.json({ count: result.upsertedCount + result.modifiedCount });
  } catch (err) {
    return next(err);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { key, label, paths, stroke, viewBox, fillRule, rawSvgContent } = req.body;

    const existing = await Icon.findOne({ key });
    if (existing) {
      return res.status(409).json({ message: `Bu key zaten kullanılıyor: ${key}` });
    }

    const icon = await Icon.create({
      key,
      label,
      paths:         paths         || [],
      stroke:        stroke        ?? true,
      viewBox:       viewBox       || null,
      fillRule:      fillRule      || null,
      rawSvgContent: sanitizeRawSvg(rawSvgContent),
    });

    return res.status(201).json({ icon: formatIcon(icon) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: `Bu key zaten kullanılıyor: ${req.body.key}` });
    }
    return next(err);
  }
});

router.put("/:key", requireAuth, async (req, res, next) => {
  try {
    const currentKey = decodeURIComponent(req.params.key);
    const { key: newKey, label, paths, stroke, viewBox, fillRule, rawSvgContent } = req.body;

    const existing = await Icon.findOne({ key: currentKey });
    if (!existing) {
      return res.status(404).json({ message: `İkon bulunamadı: ${currentKey}` });
    }

    if (newKey && newKey !== currentKey) {
      const conflict = await Icon.findOne({ key: newKey });
      if (conflict) {
        return res.status(409).json({ message: `Bu key zaten kullanılıyor: ${newKey}` });
      }
      await Icon.deleteOne({ key: currentKey });
      const created = await Icon.create({
        key:           newKey,
        label:         label         ?? existing.label,
        paths:         paths         ?? existing.paths,
        stroke:        stroke        ?? existing.stroke,
        viewBox:       viewBox       !== undefined ? (viewBox || null)  : existing.viewBox,
        fillRule:      fillRule      !== undefined ? (fillRule || null) : existing.fillRule,
        rawSvgContent: rawSvgContent !== undefined ? sanitizeRawSvg(rawSvgContent) : existing.rawSvgContent,
      });
      return res.json({ icon: formatIcon(created) });
    }

    if (label         !== undefined) existing.label         = label;
    if (paths         !== undefined) existing.paths         = paths;
    if (stroke        !== undefined) existing.stroke        = stroke;
    if (viewBox       !== undefined) existing.viewBox       = viewBox       || null;
    if (fillRule      !== undefined) existing.fillRule      = fillRule      || null;
    if (rawSvgContent !== undefined) existing.rawSvgContent = sanitizeRawSvg(rawSvgContent);

    await existing.save();
    return res.json({ icon: formatIcon(existing) });
  } catch (err) {
    return next(err);
  }
});

router.delete("/:key", requireAuth, async (req, res, next) => {
  try {
    const key = decodeURIComponent(req.params.key);
    const result = await Icon.deleteOne({ key });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: `İkon bulunamadı: ${key}` });
    }
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
