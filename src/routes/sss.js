const express = require("express");
const SssContent = require("../models/SssContent");
const { requireAuth } = require("../middleware/auth");
const { reconcileMediaOnUpdate } = require("../services/mediaReconcile");

const router = express.Router();

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

router.put("/", requireAuth, async (req, res, next) => {
  try {
    const { banner, categories } = req.body;
    const old = await SssContent.findOne().lean();
    let doc = await SssContent.findOne();
    if (!doc) {
      doc = await SssContent.create({ banner, categories });
    } else {
      doc.banner = banner ?? doc.banner;
      doc.categories = categories ?? doc.categories;
      await doc.save();
    }
    await reconcileMediaOnUpdate(old, doc.toObject(), {
      excludeModel: "SssContent",
      excludeId: doc._id,
    });
    res.json({ sss: doc.toObject() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
