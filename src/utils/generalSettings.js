const GENERAL_SETTINGS_TEMPLATE = {
  pageKey: "genel-ayarlar",
  title: "Genel Ayarlar",
  sections: [
    {
      key: "social",
      label: "Sosyal Medya",
      blocks: [
        {
          key: "links",
          label: "Sosyal Medya Hesapları",
          type: "social-list",
          value: [
            { id: "facebook",  platform: "Facebook",  url: "" },
            { id: "instagram", platform: "Instagram", url: "" },
            { id: "x",         platform: "X",         url: "" },
            { id: "linkedin",  platform: "LinkedIn",  url: "" },
            { id: "youtube",   platform: "Youtube",   url: "" },
          ],
        },
      ],
    },
  ],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeGeneralSettings(page) {
  const source = page?.toObject ? page.toObject() : page || {};
  const next = clone(GENERAL_SETTINGS_TEMPLATE);
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
        const value = sourceBlockMap.get(templateBlock.key);
        return {
          ...templateBlock,
          value: Array.isArray(value) ? value : templateBlock.value,
        };
      }),
    };
  });

  return next;
}

/** Normalize edilmiş genel-ayarlar sayfasından sosyal medya dizisini döner */
function extractSocialLinks(normalizedPage) {
  const socialSection = (normalizedPage?.sections || []).find((s) => s.key === "social");
  const linksBlock = (socialSection?.blocks || []).find((b) => b.key === "links");
  const links = Array.isArray(linksBlock?.value) ? linksBlock.value : [];
  return links.filter((item) => item.url && item.url.trim() !== "");
}

module.exports = { GENERAL_SETTINGS_TEMPLATE, normalizeGeneralSettings, extractSocialLinks };
