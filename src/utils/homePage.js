const HOME_PAGE_TEMPLATE = {
  pageKey: "home",
  title: "Ana Sayfa",
  sections: [
    {
      key: "slider",
      label: "Slider",
      blocks: [
        { key: "titleLine1", label: "Baslik 1. Satir", type: "text", value: "Dogru Zaman. Dogru" },
        { key: "titleLine2", label: "Baslik 2. Satir", type: "text", value: "Karar. Dogru Gayrimenkul." },
        { key: "description", label: "Slider Aciklama", type: "textarea", value: "Akilli filtreler ve detayli karsilastirmalarla firsatlari yakalayin; uzman ekibimizle islemlerinizi sorunsuz ve guvenle tamamlayin." },
        { key: "backgroundImage", label: "1. Slider Medyasi", type: "media", value: "/slider1.png" },
        { key: "backgroundImageSecond", label: "2. Slider Medyasi", type: "media", value: "/slider1.png" },
        { key: "topImage", label: "Baslik Ic Gorseli", type: "image", value: "/slider-ustu.png" },
        { key: "category-icons", label: "Kategori Ikonlari", type: "json", value: { satilik: "", kiralik: "", projeler: "" } },
      ],
    },
    {
      key: "about",
      label: "Hakkimizda",
      blocks: [
        { key: "badge", label: "Ust Etiket", type: "text", value: "HAKKIMIZDA" },
        { key: "title", label: "Baslik", type: "textarea", value: "Guven, Tecrube,\nDostluk" },
        { key: "description", label: "Aciklama", type: "textarea", value: "Hizmetlerimizi her zaman icin musteri memnuniyeti ve guven ilkelerini temel alarak sunmaktayiz." },
        { key: "ctaLabel", label: "Buton Metni", type: "text", value: "Daha Fazla Bilgi" },
        { key: "ctaHref", label: "Buton Linki", type: "text", value: "/hakkimizda" },
        { key: "year", label: "Yil Metni", type: "text", value: "1987" },
        { key: "videoUrl", label: "Tanitim Videosu", type: "media", value: "" },
        { key: "circleImage1", label: "Yuvarlak Gorsel 1", type: "image", value: "" },
        { key: "circleImage2", label: "Yuvarlak Gorsel 2", type: "image", value: "" },
        { key: "circleImage3", label: "Yuvarlak Gorsel 3", type: "image", value: "" },
        { key: "stats", label: "Istatistikler", type: "stat-list", value: [{ n: "36+", l1: "Yillik", l2: "Sektor Tecrubesi" }, { n: "1K+", l1: "Mutlu", l2: "Musteri" }, { n: "12", l1: "Calisan Ile Profesyonel", l2: "Hizmet Anlayisi" }] },
      ],
    },
    {
      key: "listings",
      label: "Ilanlar",
      blocks: [
        { key: "badge", label: "Ust Etiket", type: "text", value: "SIZIN ICIN" },
        { key: "title", label: "Baslik", type: "text", value: "Guvenle Arayin, Kolayca Sahip Olun" },
        { key: "description", label: "Aciklama", type: "textarea", value: "Dogru evi bulmaniz icin guvenilir ilanlar, guclu filtreleme ve uzman destegi sunuyoruz." },
        { key: "hotlineLabel", label: "Danisman Etiketi", type: "text", value: "Danisman Hatti" },
        { key: "hotlinePhone", label: "Telefon", type: "text", value: "0(216) 356 05 05" },
        { key: "ctaLabel", label: "Buton Metni", type: "text", value: "Tumunu Gor" },
        { key: "ctaHref", label: "Buton Linki", type: "text", value: "/ilanlar" },
        { key: "filters", label: "Filtreler", type: "string-list", value: ["Tumu", "Daireler", "Ticari", "Villa"] },
      ],
    },
    {
      key: "featured",
      label: "One Cikan",
      blocks: [
        { key: "ctaLabel", label: "Buton Metni", type: "text", value: "Projeyi Incele ->" },
        { key: "projects", label: "One Cikan Projeler", type: "featured-project-list", value: [{ id: "1", listingId: "9001", title: "Cadde Panorama Residence", description: "Merkezi lokasyonda, sosyal donatili yeni nesil konut projesi." }, { id: "2", listingId: "9002", title: "Marina Vadi Villa Projesi", description: "Deniz manzarali, butik villa projesi." }, { id: "3", listingId: "9003", title: "Merkez Ofis Park Karma Projesi", description: "Ofis ve rezidans birimlerini bir araya getiren merkezi karma proje." }, { id: "4", listingId: "9004", title: "Sahil Yasam Konut Projesi", description: "Denize yakin konumu ve aile yasamina uygun sosyal alanlariyla yeni proje." }] },
      ],
    },
    {
      key: "locations",
      label: "Lokasyon",
      blocks: [
        { key: "badge", label: "Ust Etiket", type: "text", value: "Lokasyona gore" },
        { key: "title", label: "Baslik", type: "textarea", value: "Lokasyona Gore\nKesfedin" },
        { key: "ctaLabel", label: "Buton Metni", type: "text", value: "Tumunu Gor" },
        { key: "ctaHref", label: "Buton Linki", type: "text", value: "/ilanlar" },
        { key: "cards", label: "Lokasyon Kartlari", type: "location-list", value: [{ image: "/lokasyon1.png", title: "Ankara / Cankaya", city: "Ankara", district: "Cankaya", count: 3 }, { image: "/lokasyon2.png", title: "Izmir / Karsiyaka", city: "Izmir", district: "Karsiyaka", count: 7 }, { image: "/lokasyon3.png", title: "Bursa / Nilufer", city: "Bursa", district: "Nilufer", count: 4 }, { image: "/lokasyon4.png", title: "Adana / Seyhan", city: "Adana", district: "Seyhan", count: 2 }] },
      ],
    },
    {
      key: "blog",
      label: "Blog",
      blocks: [
        { key: "badge", label: "Ust Etiket", type: "text", value: "BIZDEN HABERLER" },
        { key: "title", label: "Baslik", type: "text", value: "Piyasayi ve Bizi Kesfedin" },
        { key: "ctaLabel", label: "Buton Metni", type: "text", value: "Tumunu Gor" },
        { key: "ctaHref", label: "Buton Linki", type: "text", value: "/bloglar" },
        { key: "featured", label: "One Cikan Yazi", type: "blog-featured-list", value: [{ image: "/blog-detail-image.jpg", date: "2 Gun Once", title: "Buraya Ilgi Cekici Anahtar Kelime Iceren Haber Basligi Gelecek", slug: "1" }] },
        { key: "side", label: "Yandaki Yazilar", type: "blog-side-list", value: [{ title: "Buraya Ilgi Cekici Anahtar Kelime Iceren Haber Basligi Gelecek", date: "2 Gun Once", image: "/blog-mini.png", slug: "2" }, { title: "Buraya Ilgi Cekici Anahtar Kelime Iceren Haber Basligi Gelecek", date: "2 Gun Once", image: "/blog2.png", slug: "3" }, { title: "Buraya Ilgi Cekici Anahtar Kelime Iceren Haber Basligi Gelecek", date: "2 Gun Once", image: "/blog3.png", slug: "4" }, { title: "Buraya Ilgi Cekici Anahtar Kelime Iceren Haber Basligi Gelecek", date: "2 Gun Once", image: "/blog1.png", slug: "5" }] },
      ],
    },
  ],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mapLegacySliderBlocks(blocks = []) {
  const map = new Map(blocks.map((block) => [block.key, block.value]));
  return {
    titleLine1: map.get("headline") || map.get("titleLine1"),
    description: map.get("description"),
    backgroundImage: map.get("image") || map.get("backgroundImage"),
  };
}

function mapLegacyAboutBlocks(blocks = []) {
  const map = new Map(blocks.map((block) => [block.key, block.value]));
  return {
    videoUrl: map.get("videoUrl") || map.get("videoImage"),
  };
}

function ensureSliderSlidesImageMobile(blocks) {
  return (blocks || []).map((block) => {
    if (block.type !== "slider-list" || !Array.isArray(block.value)) return block;
    return {
      ...block,
      value: block.value.map((slide) => {
        if (!slide || typeof slide !== "object") return slide;
        return { ...slide, imageMobile: slide.imageMobile ?? "" };
      }),
    };
  });
}

function parseListValue(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

const FEATURED_PROJECT_ROW_KEYS = ["id", "listingId", "title", "description"];

function sanitizeFeaturedProjectListItems(value) {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (!item || typeof item !== "object") return item;
    const row = {};
    for (const key of FEATURED_PROJECT_ROW_KEYS) {
      if (item[key] !== undefined && item[key] !== null) row[key] = item[key];
    }
    return row;
  });
}

function parseJsonValue(value, fallback) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function normalizeBlockValue(templateBlock, value) {
  const listTypes = new Set(["stat-list", "string-list", "metric-list", "accordion-list", "location-list", "blog-featured-list", "blog-side-list", "featured-project-list", "slider-list"]);
  if (listTypes.has(templateBlock.type)) {
    const parsed = parseListValue(value, templateBlock.value);
    if (templateBlock.type === "featured-project-list" && parsed.length < templateBlock.value.length) {
      return [...parsed, ...templateBlock.value.slice(parsed.length)];
    }
    return parsed;
  }
  if (templateBlock.type === "json") {
    return parseJsonValue(value, templateBlock.value);
  }
  return value;
}

function normalizeHomePage(page) {
  const source = page?.toObject ? page.toObject() : page || {};
  const next = clone(HOME_PAGE_TEMPLATE);
  next._id = source._id;
  next.createdAt = source.createdAt;
  next.updatedAt = source.updatedAt;

  const sourceSections = new Map((source.sections || []).map((section) => [section.key, section]));
  const legacyAbout = mapLegacyAboutBlocks(sourceSections.get("about")?.blocks || []);

  next.sections = next.sections.map((templateSection) => {
    const sourceSection = sourceSections.get(templateSection.key);

    if (templateSection.key === "slider" && sourceSection) {
      const hasSliderList = (sourceSection.blocks || []).some((b) => b.type === "slider-list");
      if (hasSliderList) {
        return { ...sourceSection, blocks: ensureSliderSlidesImageMobile(sourceSection.blocks) };
      }
    }

    const legacySlider = mapLegacySliderBlocks(sourceSections.get("slider")?.blocks || []);
    const sourceBlockMap = new Map((sourceSection?.blocks || []).map((block) => [block.key, block.value]));
    return {
      ...templateSection,
      blocks: templateSection.blocks.map((templateBlock) => {
        let value = sourceBlockMap.has(templateBlock.key) ? normalizeBlockValue(templateBlock, sourceBlockMap.get(templateBlock.key)) : templateBlock.value;
        if (templateSection.key === "slider" && templateBlock.key === "titleLine1" && legacySlider.titleLine1) value = legacySlider.titleLine1;
        if (templateSection.key === "slider" && templateBlock.key === "description" && legacySlider.description) value = legacySlider.description;
        if (templateSection.key === "slider" && templateBlock.key === "backgroundImage" && legacySlider.backgroundImage) value = legacySlider.backgroundImage;
        if (templateSection.key === "about" && templateBlock.key === "videoUrl" && legacyAbout.videoUrl) value = legacyAbout.videoUrl;
        return { ...templateBlock, value };
      }),
    };
  });

  const featuredSection = next.sections.find((s) => s.key === "featured");
  const projectsBlock = featuredSection?.blocks?.find((b) => b.key === "projects" && b.type === "featured-project-list");
  if (projectsBlock && Array.isArray(projectsBlock.value)) {
    projectsBlock.value = sanitizeFeaturedProjectListItems(projectsBlock.value);
  }

  return next;
}

module.exports = { HOME_PAGE_TEMPLATE, normalizeHomePage };
