const crypto = require("crypto");
const express = require("express");
const Category = require("../models/Category");
const Listing = require("../models/Listing");
const ListingView = require("../models/ListingView");
const AdminUser = require("../models/AdminUser");
const { requireAuth } = require("../middleware/auth");
const { toSlug } = require("../utils/slug");
const {
  normalizeContentGallery,
  buildFieldMap,
  formatListingDetailPublic,
} = require("../utils/listingDetailFormat");
const { reconcileMediaOnUpdate, reconcileMediaOnDelete } = require("../services/mediaReconcile");
const {
  extractTasinmazId,
  getFirmaKod,
  getVergiNo,
  assertEidsIlIlceMatch,
  validateTasinmaz,
} = require("../utils/eids");

const router = express.Router();

/**
 * Her ilan create/update işleminde EİDS zorunlu — atlanamaz.
 * Kullanıcı eids + tasinmazId + vergi no + GTB taşınmaz doğrulaması + il/ilçe eşleşmesi şart.
 */
async function requireEidsForListing(req, { tasinmazId, propertyValues, city, district }) {
  const admin = await AdminUser.findById(req.user.sub).select("eids");
  if (!admin?.eids) {
    const err = new Error("EIDS yetkilendirmesini tamamlayın. İlan kaydı için EİDS zorunludur.");
    err.status = 403;
    throw err;
  }

  const cityName = String(city || "").trim();
  const districtName = String(district || "").trim();
  if (!cityName || !districtName) {
    const err = new Error("EIDS doğrulaması için il ve ilçe zorunludur.");
    err.status = 400;
    throw err;
  }

  const rawTasinmaz =
    tasinmazId != null && String(tasinmazId).trim() !== ""
      ? String(tasinmazId)
      : "";
  const fromField = rawTasinmaz.replace(/\D/g, "");
  const resolvedTasinmazId = fromField
    ? Number(fromField)
    : extractTasinmazId(propertyValues);

  if (!resolvedTasinmazId || Number.isNaN(resolvedTasinmazId)) {
    const err = new Error("Taşınmaz numarası (tasinmazId) zorunludur. EIDS doğrulaması atlanamaz.");
    err.status = 400;
    throw err;
  }

  const vergiNo = getVergiNo();
  if (!vergiNo) {
    const err = new Error("Ofis vergi numarası (EIDS_VERGI_NO) yapılandırılmamış. EIDS doğrulaması yapılamaz.");
    err.status = 500;
    throw err;
  }

  if (!getFirmaKod()) {
    const err = new Error("EIDS firma kodu yapılandırılmamış. EIDS doğrulaması yapılamaz.");
    err.status = 500;
    throw err;
  }

  const result = await validateTasinmaz({
    FirmaKod: getFirmaKod(),
    Kullanicikodu: admin.eids,
    VergiNo: vergiNo,
    TasinmazId: resolvedTasinmazId,
  });
  if (!result.ok || !result.data) {
    const err = new Error(result.message || "EIDS taşınmaz doğrulaması başarısız. İlan kaydedilemez.");
    err.status = 403;
    throw err;
  }

  const data = result.data;
  // Sadece il + ilçe; mahalle / ada / parsel yok sayılır
  assertEidsIlIlceMatch({
    city: cityName,
    district: districtName,
    eidsData: data,
  });

  return { admin, tasinmazId: resolvedTasinmazId, eidsData: data };
}

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
    cardImage: cover?.url ?? null,
    heroImage: cover?.url ?? null,
    gallery: doc.images?.map((img) => img.url) || [],
    districtText: [doc.city, doc.district].filter(Boolean).join("/"),
    detailLocation: [doc.city, doc.district, doc.neighborhood].filter(Boolean).join(" / "),
  };
}

function fingerprint(req) {
  const clientId = req.headers["x-client-id"];
  if (clientId && String(clientId).trim()) {
    return crypto.createHash("sha256").update(String(clientId).trim()).digest("hex");
  }
  const raw =
    req.headers["x-forwarded-for"] ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown";
  return crypto.createHash("sha256").update(String(raw).split(",")[0].trim()).digest("hex");
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
    if (req.query.neighborhood?.trim()) {
      query.neighborhood = { $regex: req.query.neighborhood.trim(), $options: "i" };
    }
    if (req.query.subcategory) query.subcategory = req.query.subcategory;
    if (req.query.agent) query.agent = req.query.agent;
    if (req.query.rooms) query["propertyValues.oda-sayisi"] = req.query.rooms.replace(/ /g, "+");
    if (req.query.q) {
      const q = req.query.q.trim();
      query.$or = [
        { listingNo: { $regex: q, $options: "i" } },
        { title: { $regex: q, $options: "i" } },
        { city: { $regex: q, $options: "i" } },
        { district: { $regex: q, $options: "i" } },
        { summary: { $regex: q, $options: "i" } },
      ];
    }
    if (req.query.priceMin || req.query.priceMax) {
      query.price = {};
      if (req.query.priceMin) query.price.$gte = Number(req.query.priceMin || 0);
      if (req.query.priceMax) query.price.$lte = Number(req.query.priceMax || 0);
    }
    if (req.query.areaMin || req.query.areaMax) {
      query["propertyValues.net-m2"] = {};
      if (req.query.areaMin) query["propertyValues.net-m2"].$gte = Number(req.query.areaMin || 0);
      if (req.query.areaMax) query["propertyValues.net-m2"].$lte = Number(req.query.areaMax || 0);
    }

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 8)));
    const skip = (page - 1) * limit;
    const sortMap = {
      "price-desc": { price: -1, publishedAt: -1, createdAt: -1 },
      "price-asc": { price: 1, publishedAt: -1, createdAt: -1 },
      newest: { publishedAt: -1, createdAt: -1 },
      oldest: { publishedAt: 1, createdAt: 1 },
      "area-desc": { "propertyValues.net-m2": -1, publishedAt: -1 },
      "area-asc": { "propertyValues.net-m2": 1, publishedAt: -1 },
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
    delete optionsQuery["propertyValues.net-m2"];
    delete optionsQuery.$text;
    delete optionsQuery["propertyValues.oda-sayisi"];

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
        { $group: { _id: "$propertyValues.oda-sayisi" } },
        { $match: { _id: { $ne: null, $exists: true } } },
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
    if (req.query.neighborhood?.trim()) {
      query.neighborhood = { $regex: req.query.neighborhood.trim(), $options: "i" };
    }
    if (req.query.subcategory) query.subcategory = req.query.subcategory;
    if (req.query.rooms) query["propertyValues.oda-sayisi"] = req.query.rooms.replace(/ /g, "+");
    if (req.query.q) {
      const q = req.query.q.trim();
      query.$or = [
        { listingNo: { $regex: q, $options: "i" } },
        { title: { $regex: q, $options: "i" } },
        { city: { $regex: q, $options: "i" } },
        { district: { $regex: q, $options: "i" } },
        { summary: { $regex: q, $options: "i" } },
      ];
    }
    if (req.query.priceMin || req.query.priceMax) {
      query.price = {};
      if (req.query.priceMin) query.price.$gte = Number(req.query.priceMin);
      if (req.query.priceMax) query.price.$lte = Number(req.query.priceMax);
    }
    if (req.query.areaMin || req.query.areaMax) {
      query["propertyValues.net-m2"] = {};
      if (req.query.areaMin) query["propertyValues.net-m2"].$gte = Number(req.query.areaMin);
      if (req.query.areaMax) query["propertyValues.net-m2"].$lte = Number(req.query.areaMax);
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
        .select("_id listingNo slug title transactionType status categorySlug subcategory price currency city district areaNet areaGross rooms summary badges images agent propertyValues publishedAt")
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
        summary:         doc.summary || "",
        badges:          doc.badges || [],
        cardImage:       cover?.url ?? null,
        images:          doc.images || [],
        gallery:         doc.images?.map((img) => img.url) || [],
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

    return res.json({ listing: formatListingDetailPublic(listing) });
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
    const eidsResult = await requireEidsForListing(req, {
      tasinmazId: req.body.tasinmazId,
      propertyValues: req.body.propertyValues,
      city: req.body.city,
      district: req.body.district,
    });

    const category = await Category.findById(req.body.category);
    if (!category) return res.status(400).json({ message: "Kategori gecersiz" });

    const baseSlug = req.body.slug || req.body.title;
    const payload = { ...req.body };
    payload.tasinmazId = String(eidsResult.tasinmazId);
    payload.contentGallery = normalizeContentGallery(req.body.contentGallery);
    const listing = await Listing.create({
      ...payload,
      slug: toSlug(`${baseSlug}-${req.body.listingNo || Date.now()}`),
      categorySlug: category.slug,
      publishedAt: req.body.status === "published" ? new Date() : null,
    });
    res.status(201).json({ listing: formatListing(listing) });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", requireAuth, async (req, res, next) => {
  try {
    const old = await Listing.findById(req.params.id).lean();
    if (!old) return res.status(404).json({ message: "Ilan bulunamadi" });

    const eidsResult = await requireEidsForListing(req, {
      tasinmazId: req.body.tasinmazId ?? old.tasinmazId,
      propertyValues: req.body.propertyValues ?? old.propertyValues,
      city: req.body.city ?? old.city,
      district: req.body.district ?? old.district,
    });

    const payload = { ...req.body };
    payload.tasinmazId = String(eidsResult.tasinmazId);
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
    await reconcileMediaOnUpdate(old, listing.toObject(), { excludeModel: "Listing", excludeId: listing._id });
    return res.json({ listing: formatListing(listing) });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const old = await Listing.findById(req.params.id).lean();
    if (!old) return res.status(404).end();
    await reconcileMediaOnDelete(old, { excludeModel: "Listing", excludeId: old._id });
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
