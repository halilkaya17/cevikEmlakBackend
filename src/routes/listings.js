const crypto = require("crypto");
const express = require("express");
const Category = require("../models/Category");
const Listing = require("../models/Listing");
const ListingView = require("../models/ListingView");
const { requireAuth } = require("../middleware/auth");
const { toSlug } = require("../utils/slug");

const router = express.Router();

function formatListing(listing) {
  const doc = listing.toObject ? listing.toObject() : listing;
  const cover = doc.images?.find((img) => img.isCover) || doc.images?.[0];
  const propertyValues =
    doc.propertyValues instanceof Map
      ? Object.fromEntries(doc.propertyValues.entries())
      : doc.propertyValues || {};
  return {
    ...doc,
    propertyValues,
    id: doc._id?.toString(),
    cardImage: cover?.url || "/ilan-mini-resim.png",
    heroImage: cover?.url || "/urun-ana.png",
    gallery: doc.images?.map((img) => img.url) || [],
    districtText: [doc.city, doc.district].filter(Boolean).join("/"),
    detailLocation: [doc.city, doc.district, doc.neighborhood].filter(Boolean).join(" / "),
  };
}

function fingerprint(req) {
  const raw =
    req.headers["x-client-id"] ||
    req.headers["x-forwarded-for"] ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown";
  return crypto.createHash("sha256").update(String(raw).split(",")[0]).digest("hex");
}

function normalizeContentGallery(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item) => item && typeof item === "object" && item.url)
    .map((item) => ({
      url: item.url,
      publicId: item.publicId || "",
      caption: item.caption || "",
    }));
}

router.get("/", async (req, res, next) => {
  try {
    const query = { active: true };
    if (req.query.status && req.query.status !== "all") query.status = req.query.status;
    else if (!req.query.status) query.status = "published";
    if (req.query.category) query.categorySlug = req.query.category;
    if (req.query.excludeCategory) query.categorySlug = { $ne: req.query.excludeCategory };
    if (req.query.transactionType) query.transactionType = req.query.transactionType;
    if (req.query.city) query.city = req.query.city;
    if (req.query.district) query.district = req.query.district;
    if (req.query.subcategory) query.subcategory = req.query.subcategory;
    if (req.query.rooms) query.rooms = req.query.rooms;
    if (req.query.q) query.$text = { $search: req.query.q };
    if (req.query.priceMin || req.query.priceMax) {
      query.price = {};
      if (req.query.priceMin) query.price.$gte = Number(req.query.priceMin || 0);
      if (req.query.priceMax) query.price.$lte = Number(req.query.priceMax || 0);
    }
    if (req.query.areaMin || req.query.areaMax) {
      query.areaNet = {};
      if (req.query.areaMin) query.areaNet.$gte = Number(req.query.areaMin || 0);
      if (req.query.areaMax) query.areaNet.$lte = Number(req.query.areaMax || 0);
    }

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 8)));
    const skip = (page - 1) * limit;
    const sortMap = {
      "price-desc": { price: -1, publishedAt: -1, createdAt: -1 },
      "price-asc": { price: 1, publishedAt: -1, createdAt: -1 },
      newest: { publishedAt: -1, createdAt: -1 },
      oldest: { publishedAt: 1, createdAt: 1 },
      "area-desc": { areaNet: -1, areaGross: -1, publishedAt: -1 },
      "area-asc": { areaNet: 1, areaGross: 1, publishedAt: -1 },
    };
    const sort = sortMap[req.query.sortBy] || sortMap.newest;

    const [listings, total] = await Promise.all([
      Listing.find(query)
      .populate("agent")
      .populate("category")
      .sort(sort)
      .skip(skip)
      .limit(limit),
      Listing.countDocuments(query),
    ]);

    const optionsQuery = { ...query };
    delete optionsQuery.price;
    delete optionsQuery.areaNet;
    delete optionsQuery.$text;

    const [subcategoryRows, locationRows, roomRows, priceBoundsRows] = await Promise.all([
      Listing.aggregate([
        { $match: optionsQuery },
        { $group: { _id: "$subcategory" } },
        { $match: { _id: { $ne: "" } } },
        { $sort: { _id: 1 } },
      ]),
      Listing.aggregate([
        { $match: optionsQuery },
        { $group: { _id: { city: "$city", district: "$district" } } },
        { $match: { "_id.city": { $ne: "" }, "_id.district": { $ne: "" } } },
        { $sort: { "_id.city": 1, "_id.district": 1 } },
      ]),
      Listing.aggregate([
        { $match: optionsQuery },
        { $group: { _id: "$rooms" } },
        { $match: { _id: { $ne: "", $ne: null } } },
        { $sort: { _id: 1 } },
      ]),
      Listing.aggregate([
        { $match: optionsQuery },
        {
          $group: {
            _id: null,
            min: { $min: "$price" },
            max: { $max: "$price" },
          },
        },
      ]),
    ]);

    res.json({
      listings: listings.map(formatListing),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      filters: {
        subcategories: subcategoryRows.map((row) => row._id).filter(Boolean),
        rooms: roomRows.map((row) => String(row._id)).filter(Boolean),
        locations: locationRows.map((row) => ({
          city: row._id.city,
          district: row._id.district,
          label: `${row._id.city}/${row._id.district}`,
        })),
        priceRange: {
          min: priceBoundsRows[0]?.min || 0,
          max: priceBoundsRows[0]?.max || 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/** GET /api/v1/listings/categories — ilanı olan kategoriler, isim + sayı ile */
router.get("/categories", async (_req, res, next) => {
  try {
    const [rows, allCategories] = await Promise.all([
      Listing.aggregate([
        { $match: { active: true, status: "published" } },
        { $group: { _id: "$categorySlug", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { _id: 1 } },
      ]),
      Category.find().select("slug name order").sort({ order: 1, name: 1 }).lean(),
    ]);

    const nameMap = new Map(allCategories.map((c) => [c.slug, c.name]));

    res.json({
      categories: rows.map((row) => ({
        slug:  row._id,
        name:  nameMap.get(row._id) || row._id,
        count: row.count,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Kategori property field tanımlarından key → { label, icon } haritası çıkarır.
 * Hem ana category.propertyGroups hem de subcategory'lerin tüm grupları taranır.
 */
/**
 * Kategori property tanımlarından key → { label, icon, unit, showOnCard, groupKey, groupLabel } haritası çıkarır.
 * Grup sırası korunur; aynı key ilk geçen grup kazanır.
 */
function buildFieldMap(category) {
  const map = {};
  if (!category) return map;
  const allGroups = [
    ...(category.propertyGroups || []),
    ...(category.subcategories || []).flatMap((s) => s.propertyGroups || []),
  ];
  for (const group of allGroups) {
    for (const field of group.fields || []) {
      if (field.key && !map[field.key]) {
        map[field.key] = {
          label:      field.label || field.key,
          icon:       field.icon  || "",
          unit:       field.unit  || "",
          type:       field.type  || "text",
          required:   field.required === true,
          showOnCard: field.showOnCard === true,
          quickView:  field.quickView === true || field.showOnQuickView === true,
          groupKey:   group.key,
          groupLabel: group.name,
          options:    Array.isArray(field.options) ? field.options : [],
        };
      }
    }
  }
  return map;
}

/**
 * propertyValues → showOnCard:true ve değeri dolu olanları gruplara göre döner
 * [{ groupKey, groupLabel, properties: [{ key, label, icon, unit, value }] }]
 */
function formatPropertyGroups(rawValues, fieldMap) {
  const obj =
    rawValues instanceof Map
      ? Object.fromEntries(rawValues.entries())
      : rawValues || {};

  const groupMap = new Map();

  for (const [key, value] of Object.entries(obj)) {
    const meta = fieldMap[key];
    if (!meta?.showOnCard) continue;
    if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) continue;

    if (!groupMap.has(meta.groupKey)) {
      groupMap.set(meta.groupKey, { groupKey: meta.groupKey, groupLabel: meta.groupLabel, properties: [] });
    }
    groupMap.get(meta.groupKey).properties.push({
      key,
      label: meta.label,
      icon:  meta.icon,
      unit:  meta.unit,
      type:  meta.type,
      required: meta.required,
      showOnCard: meta.showOnCard,
      quickView: meta.quickView,
      value,
    });
  }

  return Array.from(groupMap.values());
}

/** GET /api/v1/listings/cards — sadece kart için gereken alanlar */
router.get("/cards", async (req, res, next) => {
  try {
    const query = { active: true };
    if (req.query.status && req.query.status !== "all") query.status = req.query.status;
    else if (!req.query.status) query.status = "published";
    if (req.query.category) query.categorySlug = req.query.category;
    if (req.query.excludeCategory) query.categorySlug = { $ne: req.query.excludeCategory };
    if (req.query.transactionType) query.transactionType = req.query.transactionType;
    if (req.query.city) query.city = req.query.city;
    if (req.query.district) query.district = req.query.district;
    if (req.query.subcategory) query.subcategory = req.query.subcategory;
    if (req.query.rooms) query.rooms = req.query.rooms;
    if (req.query.q) query.$text = { $search: req.query.q };
    if (req.query.priceMin || req.query.priceMax) {
      query.price = {};
      if (req.query.priceMin) query.price.$gte = Number(req.query.priceMin);
      if (req.query.priceMax) query.price.$lte = Number(req.query.priceMax);
    }
    if (req.query.areaMin || req.query.areaMax) {
      query.areaNet = {};
      if (req.query.areaMin) query.areaNet.$gte = Number(req.query.areaMin);
      if (req.query.areaMax) query.areaNet.$lte = Number(req.query.areaMax);
    }

    const page  = Math.max(1, Number(req.query.page  || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 8)));
    const skip  = (page - 1) * limit;
    const sortMap = {
      "price-desc": { price: -1, publishedAt: -1, createdAt: -1 },
      "price-asc":  { price:  1, publishedAt: -1, createdAt: -1 },
      newest:       { publishedAt: -1, createdAt: -1 },
      oldest:       { publishedAt:  1, createdAt:  1 },
      "area-desc":  { areaNet: -1, areaGross: -1, publishedAt: -1 },
      "area-asc":   { areaNet:  1, areaGross:  1, publishedAt: -1 },
    };
    const sort = sortMap[req.query.sortBy] || sortMap.newest;

    const [listings, total] = await Promise.all([
      Listing.find(query)
        .select("_id listingNo slug title transactionType status categorySlug subcategory price currency city district areaNet areaGross rooms badges images agent propertyValues publishedAt")
        .populate("agent", "name firstName lastName phones photo")
        .populate("category", "name slug propertyGroups subcategories")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Listing.countDocuments(query),
    ]);

    const cards = listings.map((listing) => {
      const doc      = listing.toObject ? listing.toObject() : listing;
      const cover    = doc.images?.find((img) => img.isCover) || doc.images?.[0];
      const fieldMap = buildFieldMap(doc.category);

      return {
        id:              doc._id?.toString(),
        listingNo:       doc.listingNo,
        slug:            doc.slug,
        title:           doc.title,
        transactionType: doc.transactionType,
        status:          doc.status,
        categorySlug:    doc.categorySlug,
        subcategory:     doc.subcategory || "",
        price:           doc.price,
        currency:        doc.currency || "TRY",
        city:            doc.city || "",
        district:        doc.district || "",
        districtText:    [doc.city, doc.district].filter(Boolean).join("/"),
        areaNet:         doc.areaNet  || null,
        areaGross:       doc.areaGross || null,
        rooms:           doc.rooms || "",
        badges:          doc.badges || [],
        cardImage:       cover?.url || "/ilan-mini-resim.png",
        agent: {
          name:   doc.agent?.name || [doc.agent?.firstName, doc.agent?.lastName].filter(Boolean).join(" ") || "",
          phones: doc.agent?.phones || [],
          photo:  doc.agent?.photo  || "",
        },
        propertyGroups: formatPropertyGroups(doc.propertyValues, fieldMap),
      };
    });

    res.json({
      listings: cards,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * select/multiselect alanlar için seçili değerleri option objesiyle zenginleştirir.
 * Tek değer → { label, value, icon }
 * Dizi değer → [{ label, value, icon }, ...]
 */
function resolveOptionValues(value, options) {
  const byValue = new Map((options || []).map((o) => [String(o.value).toLowerCase(), o]));
  const byLabel = new Map((options || []).map((o) => [String(o.label).toLowerCase(), o]));

  const enrich = (v) => {
    const str = String(v).toLowerCase();
    const opt = byValue.get(str) || byLabel.get(str);
    return opt
      ? { label: opt.label, value: opt.value, icon: opt.icon || "" }
      : { label: String(v), value: String(v), icon: "" };
  };

  if (Array.isArray(value)) return value.map(enrich);
  return enrich(value);
}

/**
 * propertyValues → TÜM dolu değerler, gruplara göre (showOnCard filtresi yok)
 * select/multiselect alanlar option detaylarıyla (label, value, icon) zenginleştirilir.
 * [{ groupKey, groupLabel, properties: [{ key, label, icon, unit, type, value }] }]
 */
function formatPropertyGroupsFull(rawValues, fieldMap) {
  const obj =
    rawValues instanceof Map
      ? Object.fromEntries(rawValues.entries())
      : rawValues || {};

  const groupMap = new Map();

  for (const [key, value] of Object.entries(obj)) {
    const meta = fieldMap[key];
    if (!meta) continue;
    if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) continue;

    const isOptionField = meta.type === "select" || meta.type === "multiselect";
    const resolvedValue = isOptionField ? resolveOptionValues(value, meta.options) : value;

    if (!groupMap.has(meta.groupKey)) {
      groupMap.set(meta.groupKey, { groupKey: meta.groupKey, groupLabel: meta.groupLabel, properties: [] });
    }
    groupMap.get(meta.groupKey).properties.push({
      key,
      label: meta.label,
      icon:  meta.icon,
      unit:  meta.unit,
      type:  meta.type,
      required: meta.required,
      showOnCard: meta.showOnCard,
      quickView: meta.quickView,
      value: resolvedValue,
    });
  }

  return Array.from(groupMap.values());
}

/** GET /api/v1/listings/detail/:id — client detay sayfası için zenginleştirilmiş ilan */
router.get("/detail/:id", async (req, res, next) => {
  try {
    const idParam = req.params.id;
    const listing = await Listing.findOne({
      $or: [
        { _id: idParam.match(/^[a-f\d]{24}$/i) ? idParam : null },
        { slug: idParam },
        { listingNo: idParam },
      ],
      active: true,
    })
      .populate("agent")
      .populate("category");

    if (!listing) return res.status(404).json({ message: "Ilan bulunamadi" });

    const doc      = listing.toObject();
    const cover    = doc.images?.find((img) => img.isCover) || doc.images?.[0];
    const fieldMap = buildFieldMap(doc.category);

    return res.json({
      listing: {
        id:              doc._id?.toString(),
        listingNo:       doc.listingNo,
        slug:            doc.slug,
        title:           doc.title,
        transactionType: doc.transactionType,
        status:          doc.status,
        publishedAt:     doc.publishedAt,
        categorySlug:    doc.categorySlug,
        subcategory:     doc.subcategory || "",
        category: {
          _id:  doc.category?._id?.toString(),
          name: doc.category?.name || "",
          slug: doc.category?.slug || "",
        },

        price:    doc.price,
        currency: doc.currency || "TRY",

        city:          doc.city || "",
        district:      doc.district || "",
        neighborhood:  doc.neighborhood || "",
        address:       doc.address || "",
        locationText:  doc.locationText || "",
        coordinates:   doc.coordinates || { lat: null, lng: null },
        districtText:  [doc.city, doc.district].filter(Boolean).join("/"),
        detailLocation:[doc.city, doc.district, doc.neighborhood].filter(Boolean).join(" / "),

        areaNet:   doc.areaNet   || null,
        areaGross: doc.areaGross || null,
        rooms:     doc.rooms     || "",
        salons:    doc.salons    || "",
        bathrooms: doc.bathrooms || "",

        summary:    doc.summary    || "",
        description:doc.description|| "",
        highlights: doc.highlights || [],
        badges:     doc.badges     || [],

        cardImage:  cover?.url || "/ilan-mini-resim.png",
        heroImage:  cover?.url || "/urun-ana.png",
        gallery:    doc.images?.map((img) => ({ url: img.url, alt: img.alt || "" })) || [],
        floorPlans: doc.floorPlans || [],
        documents:  doc.documents  || [],
        contentGallery: normalizeContentGallery(doc.contentGallery),

        agent: {
          _id:       doc.agent?._id?.toString() || "",
          name:      doc.agent?.name || [doc.agent?.firstName, doc.agent?.lastName].filter(Boolean).join(" ") || "",
          firstName: doc.agent?.firstName || "",
          lastName:  doc.agent?.lastName  || "",
          title:     doc.agent?.title     || "",
          phones:    doc.agent?.phones    || [],
          email:     doc.agent?.email     || "",
          photo:     doc.agent?.photo     || "",
        },

        viewCount: doc.viewCount || 0,

        propertyGroups: formatPropertyGroupsFull(doc.propertyValues, fieldMap),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const listing = await Listing.findOne({
      $or: [{ _id: req.params.id.match(/^[a-f\d]{24}$/i) ? req.params.id : null }, { slug: req.params.id }, { listingNo: req.params.id }],
      active: true,
    })
      .populate("agent")
      .populate("category");

    if (!listing) return res.status(404).json({ message: "Ilan bulunamadi" });
    return res.json({ listing: formatListing(listing) });
  } catch (error) {
    return next(error);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const category = await Category.findById(req.body.category);
    if (!category) return res.status(400).json({ message: "Kategori gecersiz" });

    const baseSlug = req.body.slug || req.body.title;
    const payload = { ...req.body };
    payload.contentGallery = normalizeContentGallery(req.body.contentGallery);
    const listing = await Listing.create({
      ...payload,
      slug: toSlug(`${baseSlug}-${req.body.listingNo || Date.now()}`),
      categorySlug: category.slug,
      publishedAt: req.body.status === "published" ? new Date() : null,
    });
    res.status(201).json({ listing });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", requireAuth, async (req, res, next) => {
  try {
    const payload = { ...req.body };
    if (Array.isArray(req.body.contentGallery)) {
      payload.contentGallery = normalizeContentGallery(req.body.contentGallery);
    }
    if (payload.category) {
      const category = await Category.findById(payload.category);
      if (!category) return res.status(400).json({ message: "Kategori gecersiz" });
      payload.categorySlug = category.slug;
    }
    if (payload.title && !payload.slug) payload.slug = toSlug(`${payload.title}-${payload.listingNo || req.params.id}`);
    if (payload.status === "published" && !payload.publishedAt) payload.publishedAt = new Date();

    const listing = await Listing.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });
    if (!listing) return res.status(404).json({ message: "Ilan bulunamadi" });
    return res.json({ listing });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    await Listing.findByIdAndDelete(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post("/:id/view", async (req, res, next) => {
  try {
    const listing = await Listing.findOne({
      $or: [{ _id: req.params.id.match(/^[a-f\d]{24}$/i) ? req.params.id : null }, { slug: req.params.id }, { listingNo: req.params.id }],
    });
    if (!listing) return res.status(404).json({ message: "Ilan bulunamadi" });

    try {
      await ListingView.create({ listing: listing._id, fingerprint: fingerprint(req) });
      listing.viewCount += 1;
      await listing.save();
    } catch (error) {
      if (error.code !== 11000) throw error;
    }

    return res.json({ viewCount: listing.viewCount });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
