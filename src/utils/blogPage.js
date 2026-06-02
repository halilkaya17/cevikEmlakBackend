const BLOG_PAGE_TEMPLATE = {
  pageKey: "bloglar",
  title: "Blog",
  sections: [
    {
      key: "banner",
      label: "Banner",
      blocks: [
        { key: "bannerMedia", label: "Banner Görseli / Videosu", type: "media", value: "" },
        { key: "bannerMediaMobile", label: "Banner Görseli / Videosu (Mobil)", type: "media", value: "" },
        { key: "bannerTitle1Text1", label: "Banner Başlık 1. Satır 1. Yazı", type: "text", value: "" },
        { key: "bannerTitle1Text2", label: "Banner Başlık 1. Satır 2. Yazı", type: "text", value: "" },
        { key: "bannerTitle2", label: "Banner Başlık 2. Satır", type: "text", value: "" },
      ],
    },
  ],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeBlogPage(page) {
  const source = page?.toObject ? page.toObject() : page || {};
  const next = clone(BLOG_PAGE_TEMPLATE);
  next.pageKey = source.pageKey || BLOG_PAGE_TEMPLATE.pageKey;
  next.title = source.title || BLOG_PAGE_TEMPLATE.title;
  next._id = source._id;
  next.createdAt = source.createdAt;
  next.updatedAt = source.updatedAt;

  const sourceSections = new Map((source.sections || []).map((s) => [s.key, s]));

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
        return { ...templateBlock, value: sourceBlockMap.get(templateBlock.key) };
      }),
    };
  });

  return next;
}

module.exports = { BLOG_PAGE_TEMPLATE, normalizeBlogPage };
