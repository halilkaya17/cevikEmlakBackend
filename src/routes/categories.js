const express = require("express");
const Category = require("../models/Category");
const { requireAuth } = require("../middleware/auth");
const { toSlug } = require("../utils/slug");

const router = express.Router();

/** Konut / İşyeri / Arsa / Proje — seed slug’ları; silme yasak */
const CORE_ROOT_CATEGORY_SLUGS = new Set(["konut", "isyeri", "is-yeri", "arsa", "proje"]);

const requiredCoreFields = [
  { key: "oda_sayisi", label: "Oda Sayısı", type: "text", unit: "", required: false, showOnCard: true, options: [] },
  { key: "salon_sayisi", label: "Salon Sayısı", type: "text", unit: "", required: false, showOnCard: false, options: [] },
  { key: "banyo_sayisi", label: "Banyo Sayısı", type: "text", unit: "", required: false, showOnCard: false, options: [] },
];

/** "oda_sayisi" ve "oda-sayisi" gibi tire/alt çizgi farklarını eşit say */
function normalizeKey(key) {
  return (key || "").replace(/-/g, "_");
}

function findGroupByKey(groups, key) {
  return (groups || []).find((g) => normalizeKey(g.key) === normalizeKey(key));
}

function hasFieldWithKey(fields, key) {
  return (fields || []).some((f) => normalizeKey(f.key) === normalizeKey(key));
}

/** Ana kategori propertyGroups = şablon; her alt tipte bu gruplar ve alanlar korunmalı (Konut, İş Yeri, Arsa, Proje, …). */
function validateSubcategoriesPreserveTemplate(propertyGroupsTemplate, subcategories) {
  const tpl = propertyGroupsTemplate || [];
  if (!tpl.length) return null;

  for (const sub of subcategories || []) {
    const draft = sub.propertyGroups || [];
    const who = sub.name || sub.slug || "alt tip";
    for (const tg of tpl) {
      const dg = findGroupByKey(draft, tg.key);
      if (!dg) {
        return `Alt tip "${who}": ana şablondaki "${tg.name}" grubu korunmalıdır.`;
      }
      for (const tf of tg.fields || []) {
        if (!hasFieldWithKey(dg.fields, tf.key)) {
          return `Alt tip "${who}": "${tf.label}" (${tg.name}) alanı silinemez.`;
        }
      }
    }
  }
  return null;
}

function ensureCoreFields(propertyGroups = []) {
  return (propertyGroups || []).map((group) => {
    // Tüm gruplarda önce kopyaları temizle (normalized key'e göre ilk geçen kazanır)
    const seen = new Set();
    let fields = (group.fields || []).filter((f) => {
      const nk = normalizeKey(f.key);
      if (seen.has(nk)) return false;
      seen.add(nk);
      return true;
    });

    if (normalizeKey(group.key) !== "temel_ozellikler") {
      return { ...group, fields };
    }

    // temel-ozellikler grubuna zorunlu alanları ekle (yoksa)
    const fieldKeys = new Set(fields.map((f) => normalizeKey(f.key)));
    const odaIndex = fields.findIndex((f) => normalizeKey(f.key) === "oda_sayisi");
    let insertIndex = odaIndex >= 0 ? odaIndex + 1 : fields.length;

    requiredCoreFields.forEach((field) => {
      if (fieldKeys.has(normalizeKey(field.key))) return;
      fields.splice(insertIndex, 0, field);
      fieldKeys.add(normalizeKey(field.key));
      insertIndex += 1;
    });

    return { ...group, fields };
  });
}

function normalizeCategory(category) {
  const source = category?.toObject ? category.toObject() : category;
  if (!source) return source;
  return {
    ...source,
    propertyGroups: ensureCoreFields(source.propertyGroups),
    subcategories: (source.subcategories || []).map((subcategory) => ({
      ...subcategory,
      propertyGroups: ensureCoreFields(subcategory.propertyGroups),
    })),
  };
}


router.get("/", async (_req, res, next) => {
  try {
    const categories = await Category.find().sort({ order: 1, name: 1 });
    res.json({ categories: categories.map(normalizeCategory) });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const payload = { ...req.body };
    payload.slug = payload.slug || toSlug(payload.name);
    if (Array.isArray(payload.subcategories)) {
      payload.subcategories = payload.subcategories.map((item) => ({
        ...item,
        name: item.name,
        slug: item.slug || toSlug(item.name),
        propertyGroups: item.propertyGroups || [],
      }));
    }
    const tplErr = validateSubcategoriesPreserveTemplate(payload.propertyGroups, payload.subcategories);
    if (tplErr) return res.status(400).json({ message: tplErr });
    const category = await Category.create(payload);
    res.status(201).json({ category: normalizeCategory(category) });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", requireAuth, async (req, res, next) => {
  try {
    const existing = await Category.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ message: "Kategori bulunamadi" });

    const payload = { ...req.body };
    if (payload.name && !payload.slug) payload.slug = toSlug(payload.name);
    if (Array.isArray(payload.subcategories)) {
      payload.subcategories = payload.subcategories.map((item) => ({
        ...item,
        name: item.name,
        slug: item.slug || toSlug(item.name),
        propertyGroups: item.propertyGroups || [],
      }));
    }

    const template =
      payload.propertyGroups !== undefined ? payload.propertyGroups : existing.propertyGroups;
    const subsToCheck =
      payload.subcategories !== undefined ? payload.subcategories : existing.subcategories;
    const tplErr = validateSubcategoriesPreserveTemplate(template, subsToCheck);
    if (tplErr) return res.status(400).json({ message: tplErr });

    const category = await Category.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });
    if (!category) return res.status(404).json({ message: "Kategori bulunamadi" });
    return res.json({ category: normalizeCategory(category) });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const existing = await Category.findById(req.params.id).lean();
    if (!existing) return res.status(404).end();
    const slug = String(existing.slug || "").toLowerCase();
    if (CORE_ROOT_CATEGORY_SLUGS.has(slug)) {
      return res.status(403).json({ message: "Bu ana kategori (Konut, İşyeri, Arsa, Proje) silinemez." });
    }
    await Category.findByIdAndDelete(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
