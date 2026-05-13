const Listing = require("../models/Listing");
const { formatListingDetailPublic } = require("./listingDetailFormat");

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
    const listing = chosen ? formatListingDetailPublic(chosen) : null;
    return { ...row, listing };
  });

  return normalizedPage;
}

module.exports = { enrichHomePageFeaturedListings };
