const express = require("express");
const AdminUser = require("../models/AdminUser");
const { requireAuth } = require("../middleware/auth");
const {
  normalizeGsmNo,
  getFirmaKod,
  getVergiNo,
  fetchKullaniciKodu,
  validateTasinmaz,
} = require("../utils/eids");

const router = express.Router();

router.get("/config", requireAuth, (_req, res) => {
  const firmaKodu = getFirmaKod();
  const vergiNo = getVergiNo();
  if (!firmaKodu) {
    return res.status(500).json({ message: "EIDS firma kodu yapılandırılmamış" });
  }
  if (!vergiNo) {
    return res.status(500).json({ message: "EIDS vergi numarası yapılandırılmamış" });
  }
  return res.json({
    firmaKodu,
    vergiNo,
    oturumBaseUrl: "https://eids.ticaret.gov.tr/oturum",
    hasVergiNo: true,
  });
});

/** Public rozet — ilan detayında Yetki Belge No */
router.get("/badge", (_req, res) => {
  return res.json({
    officeName: String(process.env.EIDS_OFFICE_NAME || "Cadde Emlak").trim() || "Cadde Emlak",
    authCertNo: String(process.env.EIDS_AUTH_CERT_NO || "").trim(),
  });
});

router.post("/get-kullanici-kodu", requireAuth, async (req, res, next) => {
  try {
    const yetkiKodu = String(req.body?.yetkiKodu || "").trim();
    if (!yetkiKodu) {
      return res.status(400).json({ message: "yetkiKodu zorunludur" });
    }

    const admin = await AdminUser.findById(req.user.sub);
    if (!admin) return res.status(401).json({ message: "Kullanıcı bulunamadı" });

    const gsmNo = normalizeGsmNo(admin.phone);
    if (!gsmNo) {
      return res.status(400).json({
        message: "EIDS için kullanıcı telefon numarası zorunludur. Kullanıcılar sayfasından cep telefonu ekleyin.",
      });
    }

    const gtb = await fetchKullaniciKodu({ yetkiKodu, gsmNo });
    admin.eids = String(gtb.kullaniciKodu);
    await admin.save();

    return res.json({
      success: true,
      kullaniciKodu: admin.eids,
      user: {
        id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        phone: admin.phone || "",
        eids: admin.eids || "",
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/validate-tasinmaz", requireAuth, async (req, res, next) => {
  try {
    const admin = await AdminUser.findById(req.user.sub).select("eids");
    if (!admin?.eids) {
      return res.status(403).json({
        ok: false,
        message: "EIDS yetkilendirmesini tamamlayın. Doğrulama atlanamaz.",
      });
    }

    const firmaKod = getFirmaKod();
    const vergiNo = getVergiNo();
    // Client body (FirmaKod / VergiNo / Kullanicikodu) güvenilmez — her zaman sunucu + oturum
    const kullanicikodu = String(admin.eids).trim();
    const tasinmazRaw =
      req.body?.TasinmazId ??
      req.body?.tasinmazId ??
      req.body?.tasinmaz_id;
    const tasinmazDigits = String(tasinmazRaw ?? "").replace(/\D/g, "");

    if (!firmaKod) {
      return res.status(500).json({
        ok: false,
        message: "EIDS firma kodu yapılandırılmamış. EIDS doğrulaması yapılamaz.",
      });
    }
    if (!vergiNo) {
      return res.status(500).json({
        ok: false,
        message: "Ofis vergi numarası yapılandırılmamış. EIDS doğrulaması yapılamaz.",
      });
    }
    if (!tasinmazDigits) {
      return res.status(400).json({
        ok: false,
        message: "TasinmazId zorunludur. EIDS doğrulaması atlanamaz.",
      });
    }

    // GTB'ye giden body — dokümandaki birebir format
    const gtbBody = {
      FirmaKod: firmaKod,
      Kullanicikodu: kullanicikodu,
      VergiNo: String(vergiNo),
      TasinmazId: Number(tasinmazDigits),
    };

    const result = await validateTasinmaz(gtbBody);

    if (!result.ok || !result.data) {
      return res.status(403).json({ ok: false, message: result.message || "EIDS yetkiniz yok" });
    }
    return res.json({ ok: true, data: result.data });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
