const express = require("express");
const rateLimit = require("express-rate-limit");
const InboxMessage = require("../models/InboxMessage");
const Listing = require("../models/Listing");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Cok fazla istek. Lutfen bir dakika sonra tekrar deneyin." },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function pickStr(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function validateContactFields(fullName, phone, email) {
  if (fullName.length < 2 || fullName.length > 120) {
    return "Ad soyad gecersiz (2-120 karakter)";
  }
  if (phone.length < 6 || phone.length > 40) {
    return "Telefon gecersiz";
  }
  if (!email || !EMAIL_RE.test(email)) {
    return "E-posta adresi gecersiz";
  }
  return null;
}

async function resolveListing(listingIdParam) {
  const idParam = pickStr(listingIdParam);
  if (!idParam) return null;

  const listing = await Listing.findOne({
    $or: [
      { _id: idParam.match(/^[a-f\d]{24}$/i) ? idParam : null },
      { slug: idParam },
      { listingNo: idParam },
    ],
    active: true,
  }).select("_id listingNo title slug");

  if (!listing) return null;

  return {
    doc: listing,
    snapshot: {
      id: listing._id.toString(),
      listingNo: listing.listingNo || "",
      title: listing.title || "",
      slug: listing.slug || "",
    },
  };
}

function formatMessage(doc) {
  const m = doc.toObject ? doc.toObject() : doc;
  return {
    id: m._id?.toString(),
    type: m.type,
    fullName: m.fullName,
    phone: m.phone,
    email: m.email,
    listing: m.listing?.toString?.() || m.listing || null,
    listingSnapshot: m.listingSnapshot || null,
    subject: m.subject || "",
    body: m.body || "",
    read: m.read === true,
    readAt: m.readAt || null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

/** POST /api/v1/messages/listing-inquiry — ilan detay formu (public) */
router.post("/listing-inquiry", publicLimiter, async (req, res, next) => {
  try {
    const fullName = pickStr(req.body.fullName ?? req.body.adSoyad ?? req.body.name);
    const phone = pickStr(req.body.phone ?? req.body.telefon);
    const email = pickStr(req.body.email ?? req.body.mail).toLowerCase();
    const listingId = pickStr(
      req.body.listingId ?? req.body.listing ?? req.body.ilanId ?? req.body.id,
    );

    const fieldErr = validateContactFields(fullName, phone, email);
    if (fieldErr) return res.status(400).json({ message: fieldErr });
    if (!listingId) return res.status(400).json({ message: "Ilan kimligi (listingId) zorunlu" });

    const resolved = await resolveListing(listingId);
    if (!resolved) return res.status(404).json({ message: "Ilan bulunamadi" });

    const message = await InboxMessage.create({
      type: "listing_inquiry",
      fullName,
      phone,
      email,
      listing: resolved.doc._id,
      listingSnapshot: resolved.snapshot,
      body: pickStr(req.body.message ?? req.body.body),
    });

    return res.status(201).json({ ok: true, message: formatMessage(message) });
  } catch (error) {
    return next(error);
  }
});

/** POST /api/v1/messages/contact — iletisim sayfasi formu (public) */
router.post("/contact", publicLimiter, async (req, res, next) => {
  try {
    const fullName = pickStr(req.body.fullName ?? req.body.adSoyad ?? req.body.name);
    const phone = pickStr(req.body.phone ?? req.body.telefon);
    const email = pickStr(req.body.email ?? req.body.mail).toLowerCase();
    const subject = pickStr(req.body.subject ?? req.body.konu);
    const body = pickStr(req.body.message ?? req.body.body ?? req.body.mesaj);

    const fieldErr = validateContactFields(fullName, phone, email);
    if (fieldErr) return res.status(400).json({ message: fieldErr });
    if (subject.length < 1 || subject.length > 200) {
      return res.status(400).json({ message: "Konu gecersiz (1-200 karakter)" });
    }
    if (body.length < 5 || body.length > 5000) {
      return res.status(400).json({ message: "Mesaj gecersiz (5-5000 karakter)" });
    }

    const message = await InboxMessage.create({
      type: "contact",
      fullName,
      phone,
      email,
      subject,
      body,
    });

    return res.status(201).json({ ok: true, message: formatMessage(message) });
  } catch (error) {
    return next(error);
  }
});

router.use(requireAuth);

/**
 * GET /api/v1/messages — admin mesaj listesi
 * Query: type, read (true|false), page, limit
 */
router.get("/", async (req, res, next) => {
  try {
    const query = {};
    if (req.query.type === "listing_inquiry" || req.query.type === "contact") {
      query.type = req.query.type;
    }
    if (req.query.read === "true") query.read = true;
    if (req.query.read === "false") query.read = false;

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const skip = (page - 1) * limit;

    const [messages, total, unreadCount] = await Promise.all([
      InboxMessage.find(query).sort({ read: 1, createdAt: -1 }).skip(skip).limit(limit),
      InboxMessage.countDocuments(query),
      InboxMessage.countDocuments({ ...query, read: false }),
    ]);

    return res.json({
      messages: messages.map(formatMessage),
      unreadCount,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    return next(error);
  }
});

/** GET /api/v1/messages/:id — admin tekil mesaj */
router.get("/:id", async (req, res, next) => {
  try {
    const message = await InboxMessage.findById(req.params.id);
    if (!message) return res.status(404).json({ message: "Mesaj bulunamadi" });
    return res.json({ message: formatMessage(message) });
  } catch (error) {
    return next(error);
  }
});

/** PATCH /api/v1/messages/:id/read — okundu isaretle */
router.patch("/:id/read", async (req, res, next) => {
  try {
    const message = await InboxMessage.findByIdAndUpdate(
      req.params.id,
      { read: true, readAt: new Date() },
      { new: true },
    );
    if (!message) return res.status(404).json({ message: "Mesaj bulunamadi" });
    return res.json({ message: formatMessage(message) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
