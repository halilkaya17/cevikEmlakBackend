const express = require("express");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const ContactPage = require("../models/ContactPage");
const PageContent = require("../models/PageContent");
const { normalizeGeneralSettings, extractSmtpConfig } = require("../utils/generalSettings");

const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Cok fazla istek. Lutfen bir dakika sonra tekrar deneyin." },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function pickStr(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

router.post("/", limiter, async (req, res, next) => {
  try {
    const fullName = pickStr(req.body.fullName ?? req.body.adSoyad ?? req.body.name);
    const phone = pickStr(req.body.phone ?? req.body.telefon);
    const visitorEmail = pickStr(req.body.email ?? req.body.mail).toLowerCase();

    if (fullName.length < 2 || fullName.length > 120) {
      return res.status(400).json({ message: "Ad soyad gecersiz (2-120 karakter)" });
    }
    if (phone.length < 6 || phone.length > 40) {
      return res.status(400).json({ message: "Telefon gecersiz" });
    }
    if (!visitorEmail || !EMAIL_RE.test(visitorEmail)) {
      return res.status(400).json({ message: "E-posta adresi gecersiz" });
    }

    const [settingsDoc, contactDoc] = await Promise.all([
      PageContent.findOne({ pageKey: "genel-ayarlar" }).lean(),
      ContactPage.findOne().lean(),
    ]);

    if (!settingsDoc) {
      return res.status(503).json({ message: "Site ayarlari bulunamadi. SMTP yapilandirilmamis." });
    }

    const smtp = extractSmtpConfig(normalizeGeneralSettings(settingsDoc));
    if (!smtp.host) {
      return res.status(503).json({ message: "SMTP sunucu ayari yapilmamis." });
    }
    if (!smtp.user || !String(smtp.pass).trim()) {
      return res.status(503).json({ message: "SMTP kullanici adi veya sifre ayarlanmamis." });
    }

    const toEmail = pickStr(contactDoc?.email);
    if (!toEmail || !EMAIL_RE.test(toEmail)) {
      return res.status(503).json({ message: "Iletisim sayfasi e-posta adresi tanimlanmamis." });
    }

    const fromAddr = (smtp.from || smtp.user).trim();
    if (!fromAddr) {
      return res.status(503).json({ message: "Gonderen e-posta (From) ayarlanmamis." });
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    const subject = `Arama talebi — ${fullName}`;
    const text = [
      "Site uzerinden yeni bir arama talebi alindi.",
      "",
      `Ad Soyad: ${fullName}`,
      `Telefon: ${phone}`,
      `E-posta: ${visitorEmail}`,
      "",
      `Gonderim zamani: ${new Date().toISOString()}`,
    ].join("\n");

    const html = `
      <p><strong>Site üzerinden arama talebi</strong></p>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
        <tr><td style="padding:6px 12px 6px 0;"><b>Ad Soyad</b></td><td>${escapeHtml(fullName)}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;"><b>Telefon</b></td><td>${escapeHtml(phone)}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;"><b>E-posta</b></td><td>${escapeHtml(visitorEmail)}</td></tr>
      </table>
      <p style="color:#666;font-size:12px;">${escapeHtml(new Date().toISOString())}</p>
    `;

    await transporter.sendMail({
      from: smtp.fromName ? `"${smtp.fromName.replace(/"/g, "")}" <${fromAddr}>` : fromAddr,
      to: toEmail,
      replyTo: visitorEmail,
      subject,
      text,
      html,
    });

    return res.status(201).json({ ok: true, message: "Talebiniz alindi" });
  } catch (err) {
    const code = err.responseCode ?? err.code;
    err.status = typeof code === "number" && code >= 400 && code < 600 ? 502 : 500;
    err.message = err.message || "E-posta gonderilemedi";
    return next(err);
  }
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = router;
