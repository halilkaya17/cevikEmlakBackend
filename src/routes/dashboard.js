const express = require("express");
const Agent = require("../models/Agent");
const BlogPost = require("../models/BlogPost");
const Category = require("../models/Category");
const Listing = require("../models/Listing");
const MediaAsset = require("../models/MediaAsset");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, async (_req, res, next) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalListings,
      publishedListings,
      draftListings,
      archivedListings,
      totalAgents,
      totalPosts,
      publishedPosts,
      totalAssets,
      assetSizeResult,
      latestListings,
      latestPosts,
      topListings,
      categoryBreakdown,
      agentListingCounts,
      agentDocs,
      viewHistory,
    ] = await Promise.all([
      Listing.countDocuments({ active: true }),
      Listing.countDocuments({ active: true, status: "published" }),
      Listing.countDocuments({ active: true, status: "draft" }),
      Listing.countDocuments({ active: true, status: "archived" }),
      Agent.countDocuments({ active: true }),
      BlogPost.countDocuments(),
      BlogPost.countDocuments({ status: "published" }),
      MediaAsset.countDocuments(),
      MediaAsset.aggregate([{ $group: { _id: null, totalSize: { $sum: "$size" } } }]),
      Listing.find({ active: true })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("_id listingNo title status price categorySlug viewCount images publishedAt createdAt")
        .populate("agent", "name firstName lastName photo"),
      BlogPost.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select("_id title status createdAt publishedAt"),
      Listing.find({ active: true })
        .sort({ viewCount: -1 })
        .limit(5)
        .select("_id listingNo title status price categorySlug viewCount images"),
      Listing.aggregate([
        { $match: { active: true, status: "published" } },
        { $group: { _id: "$categorySlug", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
      ]),
      Listing.aggregate([
        { $match: { active: true } },
        { $group: { _id: "$agent", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null } } },
        { $sort: { count: -1 } },
      ]),
      Agent.find({ active: true }).select("_id name firstName lastName title photo").lean(),
      // Son 7 günlük günlük görüntülenme toplamı
      Listing.aggregate([
        { $match: { active: true, updatedAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$updatedAt" } },
            views: { $sum: "$viewCount" },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 7 },
      ]),
    ]);

    // Kategori isimlerini çek
    const categorySlugs = categoryBreakdown.map((r) => r._id);
    const categoryDocs = await Category.find({ slug: { $in: categorySlugs } })
      .select("slug name")
      .lean();
    const categoryNameMap = new Map(categoryDocs.map((c) => [c.slug, c.name]));

    // Agent istatistik haritası
    const agentCountMap = new Map(agentListingCounts.map((r) => [String(r._id), r.count]));
    const agents = agentDocs.map((a) => ({
      _id:          String(a._id),
      name:         [a.firstName, a.lastName].filter(Boolean).join(" ") || a.name || "",
      title:        a.title || "",
      photo:        a.photo || "",
      listingCount: agentCountMap.get(String(a._id)) || 0,
    })).sort((a, b) => b.listingCount - a.listingCount);

    // latestListings: cardImage ekle
    const formatCard = (listing) => {
      const doc = listing.toObject ? listing.toObject() : listing;
      const cover = doc.images?.find((img) => img.isCover) || doc.images?.[0];
      return {
        _id:          String(doc._id),
        listingNo:    doc.listingNo,
        title:        doc.title,
        status:       doc.status,
        price:        doc.price,
        categorySlug: doc.categorySlug,
        viewCount:    doc.viewCount || 0,
        cardImage:    cover?.url ?? null,
        agent:        doc.agent ? {
          name:  [doc.agent.firstName, doc.agent.lastName].filter(Boolean).join(" ") || doc.agent.name || "",
          photo: doc.agent.photo || "",
        } : null,
        createdAt:    doc.createdAt,
        publishedAt:  doc.publishedAt || null,
      };
    };

    const totalViews = topListings.reduce((sum, item) => sum + (item.viewCount || 0), 0);
    const totalAssetSize = assetSizeResult[0]?.totalSize || 0;

    res.json({
      stats: {
        totalListings,
        publishedListings,
        draftListings,
        archivedListings,
        totalAgents,
        totalPosts,
        publishedPosts,
        totalAssets,
        totalAssetSize,
        totalViews,
      },
      latestListings: latestListings.map(formatCard),
      topListings: topListings.map((l) => {
        const cover = l.images?.find((img) => img.isCover) || l.images?.[0];
        return {
          _id:          String(l._id),
          listingNo:    l.listingNo,
          title:        l.title,
          status:       l.status,
          price:        l.price,
          categorySlug: l.categorySlug,
          viewCount:    l.viewCount || 0,
          cardImage:    cover?.url ?? null,
        };
      }),
      categoryBreakdown: categoryBreakdown.map((row) => ({
        slug:  row._id,
        name:  categoryNameMap.get(row._id) || row._id,
        count: row.count,
      })),
      agents,
      latestPosts: latestPosts.map((p) => ({
        _id:         String(p._id),
        title:       p.title,
        status:      p.status,
        createdAt:   p.createdAt,
        publishedAt: p.publishedAt || null,
      })),
      viewHistory: viewHistory.map((r) => ({ date: r._id, views: r.views })),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
