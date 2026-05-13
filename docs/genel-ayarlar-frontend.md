# Genel site ayarları — Frontend entegrasyonu

Tüm ayarlar **tek sayfa kaydı** altında tutulur: `pageKey: "genel-ayarlar"`. Diğer sayfa içerikleriyle aynı **Pages API** kullanılır.

---

## Base URL

```
GET  /api/v1/pages/genel-ayarlar
PUT  /api/v1/pages/genel-ayarlar   →  Authorization: Bearer <admin JWT>
```

`GET` **herkese açık** (token gerekmez).  
`PUT` sadece **admin** (JWT zorunlu).

İlk `GET /api/v1/pages/genel-ayarlar` çağrısında kayıt yoksa sunucu **varsayılan şablonu** oluşturur (`findOrCreate`).

**Not:** `PUT` başarılı olduktan sonra dönen `page` cevabında da **`smtpPass` maskelenir** (GET ile aynı). Admin panel kayıt sonrası şifre alanını yine boş görür; bu beklenen davranıştır (şifre veritabanında kalır, JSON’da dönmez).

---

## GET — Ayarları okuma

```http
GET /api/v1/pages/genel-ayarlar
```

**200** — `page` objesi döner (`title`, `pageKey`, `sections`).

### Bölümler (`sections`)

| `section.key` | Açıklama |
|---------------|----------|
| `social` | Sosyal medya linkleri |
| `mail` | SMTP / gönderen e-posta ayarları |

Her bölümün `blocks[]` içinde `key`, `label`, `type`, `value` vardır.

### Sosyal medya (`social`)

- Block `key`: `links`
- `type`: `social-list`
- `value`: dizi — `{ id, platform, url }[]`

### E-posta (`mail`)

| Block `key`     | `type`    | `value` örneği        |
|-----------------|-----------|------------------------|
| `smtpHost`      | `text`    | `"smtp.gmail.com"`     |
| `smtpPort`      | `number`  | `587`                  |
| `smtpSecure`    | `boolean` | `true` / `false`       |
| `smtpUser`      | `text`    | kullanıcı e-postası   |
| `smtpPass`      | `textarea`| **GET’te her zaman `""`** |
| `mailFrom`      | `text`    | gönderen adres         |
| `mailFromName`  | `text`    | gönderen görünen ad    |

**Önemli:** Güvenlik için `GET` cevabında **`smtpPass` asla dolu dönmez** (boş string). Admin panelinde şifre alanı boş görünür; bu normal.

---

## PUT — Ayarları kaydetme

```http
PUT /api/v1/pages/genel-ayarlar
Authorization: Bearer <admin-jwt>
Content-Type: application/json
```

Body: **tam sayfa dokümanı** gönderin (diğer sayfa editörlerinde olduğu gibi): `title`, `pageKey: "genel-ayarlar"`, `sections` (en azından `social` + `mail` bloklarıyla).

### Şifre davranışı (`smtpPass`)

- Yeni şifre kaydetmek için: `smtpPass` bloğunun `value` alanına yeni şifreyi yazın.
- Şifreyi **değiştirmek istemiyorsanız**: `smtpPass` için **`value: ""`** (veya boş) gönderin — backend mevcut şifreyi **korur** (silmez).
- İlk kez kayıt: boş bırakılabilir.

### `smtpSecure` (boolean)

JSON’da gerçek boolean gönderin: `"value": true` veya `"value": false`.

### Örnek gövde (özet)

```json
{
  "pageKey": "genel-ayarlar",
  "title": "Genel Ayarlar",
  "sections": [
    {
      "key": "social",
      "label": "Sosyal Medya",
      "blocks": [
        {
          "key": "links",
          "label": "Sosyal Medya Hesapları",
          "type": "social-list",
          "value": [
            { "id": "instagram", "platform": "Instagram", "url": "https://instagram.com/..." }
          ]
        }
      ]
    },
    {
      "key": "mail",
      "label": "E-posta (SMTP)",
      "blocks": [
        { "key": "smtpHost", "label": "SMTP Sunucu (host)", "type": "text", "value": "smtp.gmail.com" },
        { "key": "smtpPort", "label": "SMTP Port", "type": "number", "value": 587 },
        { "key": "smtpSecure", "label": "TLS / SSL (güvenli bağlantı)", "type": "boolean", "value": true },
        { "key": "smtpUser", "label": "SMTP Kullanıcı Adı", "type": "text", "value": "noreply@site.com" },
        { "key": "smtpPass", "label": "SMTP Şifre / Uygulama Şifresi", "type": "textarea", "value": "" },
        { "key": "mailFrom", "label": "Gönderen e-posta (From)", "type": "text", "value": "noreply@site.com" },
        { "key": "mailFromName", "label": "Gönderen adı (From Name)", "type": "text", "value": "Çevik Emlak" }
      ]
    }
  ]
}
```

---

## Tüm sayfalar listesi (opsiyonel)

```http
GET /api/v1/pages
```

Dönen listede `genel-ayarlar` da vardır; yine **`smtpPass` maskelenmiş** olur.

---

## İletişim sayfası ile ilişki

İletişim API’si (`GET /api/v1/contact-page`) içindeki **`social`** listesi, bu sayfadaki sosyal ayarlardan üretilir; iletişim kaydında ayrıca `social` tutulmaz. Site genelinde tek kaynak: **`genel-ayarlar` → `social` → `links`**.

Site üzerinden **arama talebi** formu (`POST /api/v1/search-request`) giden maili de aynı **SMTP** ayarlarıyla gönderir; alıcı adres olarak **iletişim sayfası**ndaki `email` kullanılır. Ayrıntı: `docs/search-request-api.md`.

---

## Frontend checklist

1. Ayar ekranı açılınca: `GET /api/v1/pages/genel-ayarlar` → formu doldur.
2. Şifre alanı GET sonrası boşsa: kullanıcıya “değiştirmek için doldurun” deyin; kayıtta boş bırakınca backend eski şifreyi korur.
3. Kayıt: `PUT` + JWT; göndermeden önce `sections` yapısının şablondaki `key` değerleriyle uyumlu olduğundan emin olun (`social` / `mail` ve block `key`’leri).
4. `smtpPort` sayı, `smtpSecure` boolean olarak serialize edilsin.

---

## Block `type` değerleri (şema)

`text`, `textarea`, `number`, `boolean`, `image`, `media`, … — genel ayarlarda pratikte: `social-list`, `text`, `textarea`, `number`, `boolean`.
