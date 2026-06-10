const express = require("express");
const Location = require("../models/Location");

const router = express.Router();
router.get("/", async (req, res, next) => {
  try {
    const city     = req.query.city     ? String(req.query.city).trim()     : null;
    const district = req.query.district ? String(req.query.district).trim() : null;

    if (!city) {
      const list = await Location.aggregate([
        { $group: { _id: "$province_name" } },
        { $project: { _id: 0, name: "$_id" } },
        { $sort: { name: 1 } },
      ]);
      return res.json({ type: "cities", list });
    }

    const cityMatch = { $regex: `^${city}$`, $options: "i" };

    if (!district) {
      const list = await Location.aggregate([
        { $match: { province_name: cityMatch } },
        { $group: { _id: "$district_name" } },
        { $project: { _id: 0, name: "$_id" } },
        { $sort: { name: 1 } },
      ]);
      return res.json({ type: "districts", list });
    }

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
