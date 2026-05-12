const express = require("express");
const Agent = require("../models/Agent");
const BlogPost = require("../models/BlogPost");
const Listing = require("../models/Listing");
const MediaAsset = require("../models/MediaAsset");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, async (_req, res, next) => {
  try {
    const [totalListings, publishedListings, agents, posts, assets, latestListings, latestPosts, topListings] =
      await Promise.all([
        Listing.countDocuments(),
        Listing.countDocuments({ status: "published" }),
        Agent.countDocuments({ active: true }),
        BlogPost.countDocuments(),
        MediaAsset.countDocuments(),
        Listing.find().sort({ createdAt: -1 }).limit(5).populate("agent"),
        BlogPost.find().sort({ createdAt: -1 }).limit(5),
        Listing.find().sort({ viewCount: -1 }).limit(5),
      ]);

    const totalViews = topListings.reduce((sum, item) => sum + item.viewCount, 0);
    res.json({
      stats: { totalListings, publishedListings, agents, posts, assets, totalViews },
      latestListings,
      latestPosts,
      topListings,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
