function normalizeGsmNo(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  let normalized = digits;
  if (normalized.startsWith("90") && normalized.length === 12) {
    normalized = `0${normalized.slice(2)}`;
  } else if (normalized.length === 10 && normalized.startsWith("5")) {
    normalized = `0${normalized}`;
  }
  if (!/^0\d{10}$/.test(normalized)) return "";
  return normalized;
}

function normalizeTrPlaceName(value) {
  return String(value || "")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/I/g, "I")
    .replace(/Ş/g, "S")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C")
    .replace(/ı/g, "I")
    .replace(/ş/g, "S")
    .replace(/ğ/g, "G")
    .replace(/ü/g, "U")
    .replace(/ö/g, "O")
    .replace(/ç/g, "C")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bMAH\.?\b/g, "")
    .trim();
}

function placesMatch(a, b) {
  const left = normalizeTrPlaceName(a);
  const right = normalizeTrPlaceName(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

/**
 * EIDS data ile form adresi: sadece il + ilçe.
 * mahalle / ada / parsel karşılaştırılmaz.
 */
function assertEidsIlIlceMatch({ city, district, eidsData }) {
  const data = eidsData || {};
  if (!data.il || !placesMatch(city, data.il)) {
    const err = new Error(
      `EIDS il eşleşmiyor (ilan: "${city || ""}", EIDS: "${data.il || ""}"). Mahalle kontrol edilmez.`,
    );
    err.status = 400;
    throw err;
  }
  if (!data.ilce || !placesMatch(district, data.ilce)) {
    const err = new Error(
      `EIDS ilçe eşleşmiyor (ilan: "${district || ""}", EIDS: "${data.ilce || ""}"). Mahalle kontrol edilmez.`,
    );
    err.status = 400;
    throw err;
  }
}

function extractTasinmazId(propertyValues) {
  if (!propertyValues || typeof propertyValues !== "object") return null;
  const map =
    propertyValues instanceof Map
      ? Object.fromEntries(propertyValues.entries())
      : propertyValues;

  const keys = [
    "tasinmaz-numarasi",
    "tasinmaz_numarasi",
    "tasinmazNumarasi",
    "tasinmazNo",
    "tasinmaz_id",
    "tasinmazId",
  ];

  for (const key of keys) {
    const raw = map[key];
    if (raw == null) continue;
    if (typeof raw === "string" && raw.trim() === key) continue;
    const digits = String(raw).replace(/\D/g, "");
    if (digits) return Number(digits);
  }

  for (const [key, raw] of Object.entries(map)) {
    if (!/tasinmaz/i.test(key)) continue;
    if (typeof raw === "string" && raw.trim() === key) continue;
    const digits = String(raw).replace(/\D/g, "");
    if (digits) return Number(digits);
  }

  return null;
}

function gtbAuthHeader() {
  const user = process.env.EIDS_GTB_USER || "";
  const password = process.env.EIDS_GTB_PASSWORD || "";
  if (!user || !password) return null;
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

function getFirmaKod() {
  return String(process.env.EIDS_FIRMA_KOD || "").trim();
}

function getVergiNo() {
  return String(process.env.EIDS_VERGI_NO || "").trim();
}

async function fetchKullaniciKodu({ yetkiKodu, gsmNo }) {
  const auth = gtbAuthHeader();
  if (!auth) {
    const err = new Error("EIDS GTB kimlik bilgileri yapılandırılmamış");
    err.status = 500;
    throw err;
  }

  let res;
  let data = {};
  try {
    res = await fetch("https://ws.gtb.gov.tr:8443/EidsApi/Kullanici/GetKullaniciKodu", {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ yetkiKodu, gsmNo }),
    });
    data = await res.json().catch(() => ({}));
  } catch (networkError) {
    const detail = networkError?.cause?.message || networkError?.message || "bilinmeyen ağ hatası";
    const err = new Error(`GTB servisine bağlanılamadı (${detail}). Sunucu internet/DNS erişimini kontrol edin.`);
    err.status = 502;
    throw err;
  }

  if (!res.ok) {
    const err = new Error(data.hataMesaji || data.message || `GTB kullanıcı kodu alınamadı (HTTP ${res.status})`);
    err.status = 400;
    throw err;
  }
  if (data.hataKodu || data.hataMesaji) {
    const err = new Error(data.hataMesaji || `GTB kullanıcı kodu hatası (${data.hataKodu})`);
    err.status = 400;
    throw err;
  }
  if (!data.kullaniciKodu) {
    const err = new Error("GTB yanıtında kullanıcı kodu yok");
    err.status = 502;
    throw err;
  }
  return data;
}

async function validateTasinmaz(input) {
  const auth = gtbAuthHeader();
  const firmaKod = String(input?.FirmaKod || getFirmaKod() || "").trim();
  const kullanicikodu = String(input?.Kullanicikodu || input?.kullanicikodu || "").trim();
  const vergiNo = String(input?.VergiNo || input?.vergiNo || getVergiNo() || "").trim();
  const tasinmazId = Number(
    String(input?.TasinmazId ?? input?.tasinmazId ?? "").replace(/\D/g, ""),
  );

  if (!auth || !firmaKod) {
    const err = new Error("EIDS GTB yapılandırması eksik");
    err.status = 500;
    throw err;
  }
  if (!kullanicikodu || !vergiNo || !tasinmazId) {
    const err = new Error("FirmaKod, Kullanicikodu, VergiNo ve TasinmazId zorunludur");
    err.status = 400;
    throw err;
  }

  // Dokümandaki GTB body formatı
  const gtbBody = {
    FirmaKod: firmaKod,
    Kullanicikodu: kullanicikodu,
    VergiNo: vergiNo,
    TasinmazId: tasinmazId,
  };

  let res;
  let payload = {};
  try {
    res = await fetch("https://ws.gtb.gov.tr:8443/EidsTasinmazAPI", {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(gtbBody),
    });
    payload = await res.json().catch(() => ({}));
  } catch (networkError) {
    const detail = networkError?.cause?.message || networkError?.message || "bilinmeyen ağ hatası";
    const err = new Error(`GTB taşınmaz servisine bağlanılamadı (${detail}). EIDS doğrulaması atlanamaz.`);
    err.status = 502;
    throw err;
  }

  const statusCode = payload.statusCode ?? res.status;
  if (res.ok && statusCode === 200 && payload.data) {
    return { ok: true, data: payload.data, request: gtbBody };
  }
  return { ok: false, message: payload.message || payload.hataMesaji || "EIDS yetkiniz yok", request: gtbBody };
}

module.exports = {
  normalizeGsmNo,
  placesMatch,
  assertEidsIlIlceMatch,
  extractTasinmazId,
  getFirmaKod,
  getVergiNo,
  fetchKullaniciKodu,
  validateTasinmaz,
};
