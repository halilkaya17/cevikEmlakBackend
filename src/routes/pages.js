const express = require("express");
const PageContent = require("../models/PageContent");
const { requireAuth } = require("../middleware/auth");
const { normalizeHomePage, HOME_PAGE_TEMPLATE } = require("../utils/homePage");
const { normalizeHakkimizdaPage, HAKKIMIZDA_PAGE_TEMPLATE } = require("../utils/hakkimizdaPage");
const { normalizeGeneralSettings, GENERAL_SETTINGS_TEMPLATE } = require("../utils/generalSettings");

const router = express.Router();

/* ─── Sayfa varsayılanları: ilk erişimde otomatik oluşturulur ─── */
const PAGE_DEFAULTS = {
  home: HOME_PAGE_TEMPLATE,
  hakkimizda: HAKKIMIZDA_PAGE_TEMPLATE,
  "genel-ayarlar": GENERAL_SETTINGS_TEMPLATE,
  sertifikalar: {
    pageKey: "sertifikalar",
    title: "Sertifikalar",
    sections: [
      {
        key: "banner",
        label: "Banner",
        blocks: [
          { key: "bannerText", label: "Banner Yazısı", type: "text", value: "" },
        ],
      },
    ],
  },
};

function normalizePage(page) {
  if (!page) return page;
  const source = page.toObject ? page.toObject() : page;
  if (source.pageKey === "home") return normalizeHomePage(source);
  if (source.pageKey === "hakkimizda") return normalizeHakkimizdaPage(source);
  if (source.pageKey === "genel-ayarlar") return normalizeGeneralSettings(source);
  return source;
}

function normalizePayload(pageKey, payload) {
  if (pageKey === "home") return normalizeHomePage({ ...HOME_PAGE_TEMPLATE, ...payload, pageKey: "home" });
  if (pageKey === "hakkimizda") return normalizeHakkimizdaPage({ ...HAKKIMIZDA_PAGE_TEMPLATE, ...payload, pageKey: "hakkimizda" });
  if (pageKey === "genel-ayarlar") return normalizeGeneralSettings({ ...GENERAL_SETTINGS_TEMPLATE, ...payload, pageKey: "genel-ayarlar" });
  return payload;
}

/* Sayfa yoksa varsayılan şablonla otomatik oluştur */
async function findOrCreate(pageKey) {
  let page = await PageContent.findOne({ pageKey });
  if (!page) {
    const defaults = PAGE_DEFAULTS[pageKey] || { pageKey, title: pageKey, sections: [] };
    page = await PageContent.create(defaults);
  }
  return page;
}

router.get("/", async (_req, res, next) => {
  try {
    const pages = await PageContent.find().sort({ title: 1 });
    res.json({ pages: pages.map(normalizePage) });
  } catch (error) {
    next(error);
  }
});

router.get("/:pageKey", async (req, res, next) => {
  try {
    const page = await findOrCreate(req.params.pageKey);
    return res.json({ page: normalizePage(page) });
  } catch (error) {
    return next(error);
  }
});

router.put("/:pageKey", requireAuth, async (req, res, next) => {
  try {
    const payload = normalizePayload(req.params.pageKey, req.body);
    const page = await PageContent.findOneAndUpdate(
      { pageKey: req.params.pageKey },
      payload,
      { new: true, runValidators: true, upsert: true },
    );
    res.json({ page: normalizePage(page) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
