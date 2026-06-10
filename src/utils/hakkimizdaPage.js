const HAKKIMIZDA_PAGE_TEMPLATE = {
  pageKey: "hakkimizda",
  title: "Hakkımızda",
  sections: [
    {
      key: "banner",
      label: "Banner",
      blocks: [
        { key: "bannerMedia", label: "Banner Görseli / Videosu", type: "media", value: "" },
        { key: "bannerTitle1Text1", label: "Banner Başlık 1. Satır 1. Yazı", type: "text", value: "" },
        { key: "bannerTitle1Text2", label: "Banner Başlık 1. Satır 2. Yazı", type: "text", value: "" },
        { key: "bannerTitle2", label: "Banner Başlık 2. Satır", type: "text", value: "" },
      ],
    },
    {
      key: "intro",
      label: "Giriş",
      blocks: [
        { key: "subTitle", label: "Sol Başlık", type: "text", value: "" },
        { key: "title", label: "Ana Başlık", type: "text", value: "" },
        { key: "subtext", label: "Alt Başlık", type: "text", value: "" },
      ],
    },
    {
      key: "images",
      label: "Görseller",
      blocks: [
        { key: "image1", label: "Görsel 1", type: "image", value: "" },
        { key: "image2", label: "Görsel 2", type: "image", value: "" },
        { key: "image3", label: "Görsel 3", type: "image", value: "" },
        { key: "image4", label: "Görsel 4", type: "image", value: "" },
      ],
    },
    {
      key: "content",
      label: "İçerik",
      blocks: [
        { key: "leftLine1", label: "Sol Başlık 1. Satır", type: "text", value: "" },
        { key: "leftLine2", label: "Sol Başlık 2. Satır", type: "text", value: "" },
        { key: "leftLine3", label: "Sol Başlık 3. Satır", type: "text", value: "" },
        { key: "leftLine4", label: "Sol Başlık 4. Satır", type: "text", value: "" },
        { key: "stat1Value", label: "1. İstatistik Değeri", type: "text", value: "" },
        { key: "stat1Title", label: "1. İstatistik Başlığı", type: "text", value: "" },
        { key: "stat1Desc", label: "1. İstatistik Açıklama", type: "text", value: "" },
        { key: "stat2Value", label: "2. İstatistik Değeri", type: "text", value: "" },
        { key: "stat2Title", label: "2. İstatistik Başlığı", type: "text", value: "" },
        { key: "stat2Desc", label: "2. İstatistik Açıklama", type: "text", value: "" },
      ],
    },
    {
      key: "bottomMedia",
      label: "Alt Medya",
      blocks: [
        { key: "media", label: "Alt Medya (Resim / Video)", type: "media", value: "" },
      ],
    },
    {
      key: "timeline",
      label: "Kronolojik Geçmiş",
      blocks: [
        {
          key: "items",
          label: "Zaman Çizelgesi",
          type: "timeline-list",
          value: [],
        },
      ],
    },
  ],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeHakkimizdaPage(page) {
  const source = page?.toObject ? page.toObject() : page || {};
  const next = clone(HAKKIMIZDA_PAGE_TEMPLATE);
  next._id = source._id;
  next.createdAt = source.createdAt;
  next.updatedAt = source.updatedAt;

  const sourceSections = new Map(
    (source.sections || []).map((s) => [s.key, s]),
  );

  next.sections = next.sections.map((templateSection) => {
    const sourceSection = sourceSections.get(templateSection.key);
    if (!sourceSection) return templateSection;

    const sourceBlockMap = new Map(
      (sourceSection.blocks || []).map((b) => [b.key, b.value]),
    );

    return {
      ...templateSection,
      blocks: templateSection.blocks.map((templateBlock) => {
        if (!sourceBlockMap.has(templateBlock.key)) return templateBlock;
        let value = sourceBlockMap.get(templateBlock.key);
        if (templateBlock.type === "timeline-list") {
          value = Array.isArray(value) ? value : [];
        }
        return { ...templateBlock, value };
      }),
    };
  });

  return next;
}

module.exports = { HAKKIMIZDA_PAGE_TEMPLATE, normalizeHakkimizdaPage };
