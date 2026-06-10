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
    mapUrl: "",
  };
}

async function getSocialLinks() {
  let settingsPage = await PageContent.findOne({ pageKey: "genel-ayarlar" });
  if (!settingsPage) {
    settingsPage = await PageContent.create(GENERAL_SETTINGS_TEMPLATE);
  }
  return extractSocialLinks(normalizeGeneralSettings(settingsPage));
}

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
  out.mapUrl = typeof body.mapUrl === "string" ? body.mapUrl.trim() : "";
  delete out.social;
  delete out.mapLatitude;
  delete out.mapLongitude;
  delete out.mapZoom;
  return out;
}

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
