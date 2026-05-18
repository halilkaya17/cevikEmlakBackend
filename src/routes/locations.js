const express = require("express");
const Location = require("../models/Location");

const router = express.Router();

/**
 * GET /api/v1/locations
 *   → tüm iller  { type: "cities", list: [{ name }] }
 *
 * GET /api/v1/locations?city=Adana
 *   → ilçeler    { type: "districts", list: [{ name }] }
 *
 * GET /api/v1/locations?city=Adana&district=Aladağ
 *   → mahalleler { type: "neighbourhoods", list: [{ name }] }
 */
router.get("/", async (req, res, next) => {
  try {
    const city     = req.query.city     ? String(req.query.city).trim()     : null;
    const district = req.query.district ? String(req.query.district).trim() : null;

    // İller
    if (!city) {
      const list = await Location.aggregate([
        { $group: { _id: "$province_name" } },
        { $project: { _id: 0, name: "$_id" } },
        { $sort: { name: 1 } },
      ]);
      return res.json({ type: "cities", list });
    }

    const cityMatch = { $regex: `^${city}$`, $options: "i" };

    // İlçeler
    if (!district) {
      const list = await Location.aggregate([
        { $match: { province_name: cityMatch } },
        { $group: { _id: "$district_name" } },
        { $project: { _id: 0, name: "$_id" } },
        { $sort: { name: 1 } },
      ]);
      return res.json({ type: "districts", list });
    }

    // Mahalleler
    const districtMatch = { $regex: `^${district}$`, $options: "i" };
    const docs = await Location.find(
      { province_name: cityMatch, district_name: districtMatch },
      { _id: 0, quarter_name: 1 },
    )
      .sort({ quarter_name: 1 })
      .lean();

    return res.json({
      type: "neighbourhoods",
      list: docs.map((r) => ({ name: r.quarter_name })),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
