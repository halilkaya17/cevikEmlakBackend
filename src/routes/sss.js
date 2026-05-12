const express = require("express");
const SssContent = require("../models/SssContent");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/** GET /api/v1/sss — herkese açık; tek doküman döner */
router.get("/", async (_req, res, next) => {
  try {
    let doc = await SssContent.findOne();
    if (!doc) {
      doc = await SssContent.create({ banner: { title: "", image1: "", image2: "" }, categories: [] });
    }
    res.json({ sss: doc.toObject() });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/v1/sss — yetkili; tüm içeriği günceller */
router.put("/", requireAuth, async (req, res, next) => {
  try {
    const { banner, categories } = req.body;
    let doc = await SssContent.findOne();
    if (!doc) {
      doc = await SssContent.create({ banner, categories });
    } else {
      doc.banner = banner ?? doc.banner;
      doc.categories = categories ?? doc.categories;
      await doc.save();
    }
    res.json({ sss: doc.toObject() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
