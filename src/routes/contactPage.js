const express = require("express");
const ContactPage = require("../models/ContactPage");
const PageContent = require("../models/PageContent");
const { requireAuth } = require("../middleware/auth");
const { normalizeGeneralSettings, extractSocialLinks, GENERAL_SETTINGS_TEMPLATE } = require("../utils/generalSettings");

const router = express.Router();

function emptyDoc() {
  return {
    headline: "",
    subheadline: "",
    phone: "",
    fax: "",
    email: "",
    address: "",
    mapLatitude: null,
    mapLongitude: null,
    mapZoom: 15,
  };
}

async function getSocialLinks() {
  let settingsPage = await PageContent.findOne({ pageKey: "genel-ayarlar" });
  if (!settingsPage) {
    settingsPage = await PageContent.create(GENERAL_SETTINGS_TEMPLATE);
  }
  return extractSocialLinks(normalizeGeneralSettings(settingsPage));
}

/** GET — herkese açık */
router.get("/", async (_req, res, next) => {
  try {
    let doc = await ContactPage.findOne();
    if (!doc) {
      doc = await ContactPage.create(emptyDoc());
    }
    const social = await getSocialLinks();
    res.json({ contact: { ...doc.toObject(), social } });
  } catch (err) {
    next(err);
  }
});

function sanitizeBody(body) {
  const out = { ...emptyDoc(), ...body };
  const parseCoord = (v) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  out.mapLatitude = parseCoord(body.mapLatitude);
  out.mapLongitude = parseCoord(body.mapLongitude);
  const z = parseCoord(body.mapZoom);
  out.mapZoom = z != null ? Math.min(21, Math.max(1, Math.round(z))) : 15;
  delete out.social;
  return out;
}

/** PUT — yönetim */
router.put("/", requireAuth, async (req, res, next) => {
  try {
    const body = sanitizeBody(req.body);
    let doc = await ContactPage.findOne();
    if (!doc) {
      doc = await ContactPage.create(body);
    } else {
      Object.assign(doc, body);
      await doc.save();
    }
    const social = await getSocialLinks();
    res.json({ contact: { ...doc.toObject(), social } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
