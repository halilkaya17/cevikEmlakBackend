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
            { id: "facebook", platform: "Facebook", url: "" },
            { id: "instagram", platform: "Instagram", url: "" },
            { id: "x", platform: "X", url: "" },
            { id: "linkedin", platform: "LinkedIn", url: "" },
            { id: "youtube", platform: "Youtube", url: "" },
          ],
        },
      ],
    },
    {
      key: "mail",
      label: "E-posta (SMTP)",
      blocks: [
        { key: "smtpHost", label: "SMTP Sunucu (host)", type: "text", value: "" },
        { key: "smtpPort", label: "SMTP Port", type: "number", value: 587 },
        { key: "smtpSecure", label: "TLS / SSL (güvenli bağlantı)", type: "boolean", value: false },
        { key: "smtpUser", label: "SMTP Kullanıcı Adı", type: "text", value: "" },
        { key: "smtpPass", label: "SMTP Şifre / Uygulama Şifresi", type: "textarea", value: "" },
        { key: "mailFrom", label: "Gönderen e-posta (From)", type: "text", value: "" },
        { key: "mailFromName", label: "Gönderen adı (From Name)", type: "text", value: "" },
      ],
    },
  ],
};

const LIST_BLOCK_TYPES = new Set(["social-list"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeBlockValue(templateBlock, raw) {
  if (!LIST_BLOCK_TYPES.has(templateBlock.type)) {
    if (raw === undefined || raw === null) return templateBlock.value;
    return raw;
  }
  return Array.isArray(raw) ? raw : templateBlock.value;
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

    const sourceBlockMap = new Map((sourceSection.blocks || []).map((b) => [b.key, b.value]));

    return {
      ...templateSection,
      blocks: templateSection.blocks.map((templateBlock) => {
        if (!sourceBlockMap.has(templateBlock.key)) return templateBlock;
        const value = normalizeBlockValue(templateBlock, sourceBlockMap.get(templateBlock.key));
        return { ...templateBlock, value };
      }),
    };
  });

  return next;
}

function extractSocialLinks(normalizedPage) {
  const socialSection = (normalizedPage?.sections || []).find((s) => s.key === "social");
  const linksBlock = (socialSection?.blocks || []).find((b) => b.key === "links");
  const links = Array.isArray(linksBlock?.value) ? linksBlock.value : [];
  return links.filter((item) => item.url && item.url.trim() !== "");
}

function getBlockValue(sections, sectionKey, blockKey) {
  const sec = (sections || []).find((s) => s.key === sectionKey);
  const block = (sec?.blocks || []).find((b) => b.key === blockKey);
  return block?.value;
}

function setBlockValue(sections, sectionKey, blockKey, value) {
  const sec = (sections || []).find((s) => s.key === sectionKey);
  if (!sec) return;
  const block = (sec.blocks || []).find((b) => b.key === blockKey);
  if (block) block.value = value;
}

function maskMailSecretsForPublic(page) {
  const doc = page?.toObject ? page.toObject() : page;
  if (!doc || doc.pageKey !== "genel-ayarlar") return page;
  const next = clone(doc);
  setBlockValue(next.sections, "mail", "smtpPass", "");
  return next;
}
function preserveSmtpPasswordIfEmpty(payload, existingLean) {
  if (!payload || payload.pageKey !== "genel-ayarlar" || !existingLean) return payload;
  const incoming = getBlockValue(payload.sections, "mail", "smtpPass");
  const prev = getBlockValue(existingLean.sections, "mail", "smtpPass");
  const incomingEmpty = incoming === undefined || incoming === null || String(incoming).trim() === "";
  if (incomingEmpty && prev !== undefined && prev !== null && String(prev).trim() !== "") {
    setBlockValue(payload.sections, "mail", "smtpPass", prev);
  }
  return payload;
}

function extractSmtpConfig(normalizedPage) {
  const sections = normalizedPage?.sections || [];
  const host = String(getBlockValue(sections, "mail", "smtpHost") || "").trim();
  const portRaw = getBlockValue(sections, "mail", "smtpPort");
  const port = Number(portRaw);
  const secure = getBlockValue(sections, "mail", "smtpSecure") === true;
  const user = String(getBlockValue(sections, "mail", "smtpUser") || "").trim();
  const pass = String(getBlockValue(sections, "mail", "smtpPass") || "");
  const from = String(getBlockValue(sections, "mail", "mailFrom") || "").trim() || user;
  const fromName = String(getBlockValue(sections, "mail", "mailFromName") || "").trim();
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    secure,
    user,
    pass,
    from,
    fromName,
  };
}

module.exports = {
  GENERAL_SETTINGS_TEMPLATE,
  normalizeGeneralSettings,
  extractSocialLinks,
  extractSmtpConfig,
  maskMailSecretsForPublic,
  preserveSmtpPasswordIfEmpty,
};
