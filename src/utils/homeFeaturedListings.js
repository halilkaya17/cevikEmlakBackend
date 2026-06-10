const Listing = require("../models/Listing");
const { formatListingDetailPublic } = require("./listingDetailFormat");

/**
 * locations → cards (location-list) bloğundaki her kartın count değerini
 * gerçek ilan sayısıyla günceller. neighborhood varsa onu da filtreler.
 * Proje kategorisi hariç tutulur (ilan listesi /cards ile aynı mantık).
 */
async function enrichHomePageLocationCounts(normalizedPage) {
  if (!normalizedPage || normalizedPage.pageKey !== "home") return normalizedPage;

  const locSection = normalizedPage.sections?.find((s) => s.key === "locations");
  const cardsBlock = locSection?.blocks?.find((b) => b.key === "cards" && b.type === "location-list");
  if (!cardsBlock || !Array.isArray(cardsBlock.value) || cardsBlock.value.length === 0) return normalizedPage;

  cardsBlock.value = await Promise.all(
    cardsBlock.value.map(async (card) => {
      const q = {
        active: true,
        status: "published",
        categorySlug: { $ne: "proje" },
      };
      if (card.city?.trim()) q.city = card.city.trim();
      if (card.district?.trim()) q.district = card.district.trim();
      if (card.neighborhood?.trim()) q.neighborhood = { $regex: card.neighborhood.trim(), $options: "i" };
      const count = await Listing.countDocuments(q);
      return { ...card, count };
    }),
  );

  return normalizedPage;
}

function pickListingForRef(docs, ref) {
  const s = String(ref ?? "").trim();
  if (!s) return null;
  if (/^[a-f\d]{24}$/i.test(s)) {
    const byId = docs.find((d) => String(d._id) === s);
    if (byId) return byId;
  }
  const byNo = docs.find((d) => String(d.listingNo) === s);
  if (byNo) return byNo;
  return docs.find((d) => String(d.slug) === s) || null;
}

/**
 * normalizeHomePage çıktısında featured → projects satırlarına,
 * GET /listings/detail/:id ile aynı yapıda `listing` ekler (bulunamazsa null).
 */
async function enrichHomePageFeaturedListings(normalizedPage) {
  if (!normalizedPage || normalizedPage.pageKey !== "home") return normalizedPage;

  const featured = normalizedPage.sections?.find((s) => s.key === "featured");
  const block = featured?.blocks?.find((b) => b.key === "projects" && b.type === "featured-project-list");
  if (!block || !Array.isArray(block.value)) return normalizedPage;

  const refs = [
    ...new Set(block.value.map((r) => r?.listingId).filter((x) => x != null && String(x).trim()).map(String)),
  ];
  if (refs.length === 0) return normalizedPage;

  const or = [];
  for (const ref of refs) {
    if (/^[a-f\d]{24}$/i.test(ref)) or.push({ _id: ref });
    or.push({ listingNo: ref });
    or.push({ slug: ref });
  }

  const listings = await Listing.find({ active: true, $or: or }).populate("agent").populate("category");

  block.value = block.value.map((row) => {
    const chosen = pickListingForRef(listings, row?.listingId);
    if (!chosen) return { ...row, listing: null };

    const full = formatListingDetailPublic(chosen);

    // Ana sayfada sadece showOnCard && quickView olan özellikler yeterli
    const propertyGroups = full.propertyGroups
      .map((group) => ({
        ...group,
        properties: group.properties.filter((p) => p.showOnCard && p.quickView),
      }))
      .filter((group) => group.properties.length > 0);

    return { ...row, listing: { ...full, propertyGroups } };
  });

  return normalizedPage;
}

module.exports = { enrichHomePageFeaturedListings, enrichHomePageLocationCounts };
