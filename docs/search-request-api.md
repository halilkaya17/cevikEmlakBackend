# Arama talebi (site formu) — `POST /api/v1/search-request`

Ziyaretçi ad, telefon ve e-posta gönderir. Sunucu **Genel Ayarlar** (`genel-ayarlar`) içindeki SMTP bilgilerini kullanarak maili **İletişim sayfası**ndaki `email` adresine yollar.

- Kimlik doğrulama **gerekmez** (public).
- Dakikada en fazla **8** istek (IP bazlı ek limit).

---

## İstek

```http
POST /api/v1/search-request
Content-Type: application/json
```

### Body (alan adları — ikisi de kabul edilir)

| Alan | Alternatif isimler | Zorunlu |
|------|-------------------|---------|
| Ad soyad | `fullName`, `adSoyad`, `name` | Evet |
| Telefon | `phone`, `telefon` | Evet |
| E-posta | `email`, `mail` | Evet |

Örnek:

```json
{
  "fullName": "Ayşe Yılmaz",
  "phone": "+90 532 000 00 00",
  "email": "ayse@ornek.com"
}
```

---

## Başarı — `201 Created`

```json
{
  "ok": true,
  "message": "Talebiniz alindi"
}
```

Giden mailde **To:** İletişim sayfasındaki `email`. **Reply-To:** ziyaretçinin e-postası (cevap vermek kolay olsun diye).

---

## Hatalar

| HTTP | Örnek `message` |
|------|-----------------|
| `400` | Doğrulama (ad/telefon/e-posta) |
| `503` | SMTP veya iletişim e-postası yapılandırılmamış |
| `502` / `500` | SMTP sunucusu reddetti veya gönderim hatası |

Sunucunun mail atabilmesi için admin panelinde:

1. **Site ayarları** → `genel-ayarlar` → **E-posta (SMTP)** bölümü doldurulmuş olmalı (`smtpHost`, `smtpPort`, `smtpSecure`, `smtpUser`, `smtpPass`, `mailFrom` / `mailFromName`).
2. **İletişim sayfası** → `email` alanı dolu olmalı (`PUT /api/v1/contact-page` veya ilk `GET` ile oluşturulan kayıt).

---

## cURL

```bash
curl -X POST "https://DOMAIN/api/v1/search-request" \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Test User","phone":"05551234567","email":"test@example.com"}'
```
