/**
 * GET /listings/detail/:id ile aynı şekilde zenginleştirilmiş ilan objesi (public).
 */

function normalizeContentGallery(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item) => item && typeof item === "object" && item.url)
    .map((item) => ({
      url: item.url,
      publicId: item.publicId || "",
      caption: item.caption || "",
    }));
}

function buildFieldMap(category) {
  const map = {};
  if (!category) return map;
  const allGroups = [
    ...(category.propertyGroups || []),
    ...(category.subcategories || []).flatMap((s) => s.propertyGroups || []),
  ];
  for (const group of allGroups) {
    for (const field of group.fields || []) {
      if (field.key && !map[field.key]) {
        map[field.key] = {
          label: field.label || field.key,
          icon: field.icon || "",
          unit: field.unit || "",
          type: field.type || "text",
          required: field.required === true,
          showOnCard: field.showOnCard === true,
          quickView: field.quickView === true || field.showOnQuickView === true,
          groupKey: group.key,
          groupLabel: group.name,
          options: Array.isArray(field.options) ? field.options : [],
        };
      }
    }
  }
  return map;
}

function resolveOptionValues(value, options) {
  const byValue = new Map((options || []).map((o) => [String(o.value).toLowerCase(), o]));
  const byLabel = new Map((options || []).map((o) => [String(o.label).toLowerCase(), o]));

  const enrich = (v) => {
    const str = String(v).toLowerCase();
    const opt = byValue.get(str) || byLabel.get(str);
    return opt
      ? { label: opt.label, value: opt.value, icon: opt.icon || "" }
      : { label: String(v), value: String(v), icon: "" };
  };

  if (Array.isArray(value)) return value.map(enrich);
  return enrich(value);
}

function formatPropertyGroupsFull(rawValues, fieldMap) {
  const obj =
    rawValues instanceof Map
      ? Object.fromEntries(rawValues.entries())
      : rawValues || {};

  const groupMap = new Map();

  for (const [key, value] of Object.entries(obj)) {
    const meta = fieldMap[key];
    if (!meta) continue;
    if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) continue;

    const isOptionField = meta.type === "select" || meta.type === "multiselect";
    const resolvedValue = isOptionField ? resolveOptionValues(value, meta.options) : value;

    if (!groupMap.has(meta.groupKey)) {
      groupMap.set(meta.groupKey, { groupKey: meta.groupKey, groupLabel: meta.groupLabel, properties: [] });
    }
    groupMap.get(meta.groupKey).properties.push({
      key,
      label: meta.label,
      icon: meta.icon,
      unit: meta.unit,
      type: meta.type,
      required: meta.required,
      showOnCard: meta.showOnCard,
      quickView: meta.quickView,
      value: resolvedValue,
    });
  }

  return Array.from(groupMap.values());
}

/** Mongoose belgesi veya düz obje; agent + category populate edilmiş olmalı */
function formatListingDetailPublic(listing) {
  const doc = listing.toObject ? listing.toObject() : listing;
  const cover = doc.images?.find((img) => img.isCover) || doc.images?.[0];
  const fieldMap = buildFieldMap(doc.category);

  return {
    id: doc._id?.toString(),
    listingNo: doc.listingNo,
    slug: doc.slug,
    title: doc.title,
    transactionType: doc.transactionType,
    status: doc.status,
    publishedAt: doc.publishedAt,
    categorySlug: doc.categorySlug,
    subcategory: doc.subcategory || "",
    category: {
      _id: doc.category?._id?.toString(),
      name: doc.category?.name || "",
      slug: doc.category?.slug || "",
    },

    price: doc.price,
    currency: doc.currency || "TRY",

    city: doc.city || "",
    district: doc.district || "",
    neighborhood: doc.neighborhood || "",
    address: doc.address || "",
    locationText: doc.locationText || "",
    coordinates: doc.coordinates || { lat: null, lng: null },
    districtText: [doc.city, doc.district].filter(Boolean).join("/"),
    detailLocation: [doc.city, doc.district, doc.neighborhood].filter(Boolean).join(" / "),

    areaNet: doc.areaNet || null,
    areaGross: doc.areaGross || null,
    rooms: doc.rooms || "",
    salons: doc.salons || "",
    bathrooms: doc.bathrooms || "",

    summary: doc.summary || "",
    description: doc.description || "",
    highlights: doc.highlights || [],
    badges: doc.badges || [],

    cardImage: cover?.url || "/ilan-mini-resim.png",
    heroImage: cover?.url || "/urun-ana.png",
    gallery: doc.images?.map((img) => ({ url: img.url, alt: img.alt || "" })) || [],
    floorPlans: doc.floorPlans || [],
    documents: doc.documents || [],
    contentGallery: normalizeContentGallery(doc.contentGallery),

    agent: {
      _id: doc.agent?._id?.toString() || "",
      name: doc.agent?.name || [doc.agent?.firstName, doc.agent?.lastName].filter(Boolean).join(" ") || "",
      firstName: doc.agent?.firstName || "",
      lastName: doc.agent?.lastName || "",
      title: doc.agent?.title || "",
      phones: doc.agent?.phones || [],
      email: doc.agent?.email || "",
      photo: doc.agent?.photo || "",
    },

    viewCount: doc.viewCount || 0,

    propertyGroups: formatPropertyGroupsFull(doc.propertyValues, fieldMap),
  };
}

module.exports = {
  normalizeContentGallery,
  buildFieldMap,
  formatListingDetailPublic,
};
