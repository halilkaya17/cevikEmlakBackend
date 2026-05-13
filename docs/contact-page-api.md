# İletişim Sayfası API Dokümantasyonu

**Base URL:** `https://<domain>/api/v1/contact-page`

---

## 1. İletişim Bilgilerini Getir

Sayfada gösterilecek tüm iletişim bilgilerini döner. Kimlik doğrulaması **gerekmez**.

### Request

```
GET /api/v1/contact-page
```

### Response — `200 OK`

```json
{
  "contact": {
    "_id": "664a1c2f...",
    "headline": "Bize Ulaşın",
    "subheadline": "Sorularınız için her zaman buradayız.",
    "phone": "+90 312 000 00 00",
    "fax": "+90 312 000 00 01",
    "email": "info@cevikemlak.com",
    "address": "Atatürk Cad. No:1 Ankara",
    "mapLatitude": 39.9255,
    "mapLongitude": 32.8664,
    "mapZoom": 15,
    "social": [
      {
        "id": "fb",
        "platform": "facebook",
        "url": "https://facebook.com/cevikemlak"
      },
      {
        "id": "ig",
        "platform": "instagram",
        "url": "https://instagram.com/cevikemlak"
      }
    ],
    "createdAt": "2024-05-01T10:00:00.000Z",
    "updatedAt": "2024-05-10T08:30:00.000Z"
  }
}
```

### Alan Açıklamaları

| Alan | Tip | Açıklama |
|---|---|---|
| `headline` | string | Sayfanın ana başlığı |
| `subheadline` | string | Alt başlık / kısa açıklama |
| `phone` | string | Telefon numarası |
| `fax` | string | Faks numarası |
| `email` | string | E-posta adresi |
| `address` | string | Adres metni |
| `mapLatitude` | number \| null | Harita enlem koordinatı |
| `mapLongitude` | number \| null | Harita boylam koordinatı |
| `mapZoom` | number | Harita zoom seviyesi (1–21, varsayılan: 15) |
| `social` | array | Sosyal medya bağlantıları |
| `social[].id` | string | Benzersiz tanımlayıcı |
| `social[].platform` | string | Platform adı (örn. `"facebook"`, `"instagram"`) |
| `social[].url` | string | Sosyal medya profil URL'i |

---

## 2. İletişim Bilgilerini Güncelle

Sadece **yetkili** (giriş yapmış admin) kullanıcılar bu endpoint'i kullanabilir.

### Request

```
PUT /api/v1/contact-page
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**

```json
{
  "headline": "Bize Ulaşın",
  "subheadline": "Sorularınız için buradayız.",
  "phone": "+90 312 000 00 00",
  "fax": "+90 312 000 00 01",
  "email": "info@cevikemlak.com",
  "address": "Atatürk Cad. No:1 Ankara",
  "mapLatitude": 39.9255,
  "mapLongitude": 32.8664,
  "mapZoom": 15,
  "social": [
    {
      "id": "fb",
      "platform": "facebook",
      "url": "https://facebook.com/cevikemlak"
    }
  ]
}
```

### Response — `200 OK`

GET ile aynı yapıda `contact` objesi döner.

---

## Frontend Kullanım Örneği (JavaScript / Fetch)

### Veriyi Çekme

```js
const res = await fetch('https://<domain>/api/v1/contact-page');
const { contact } = await res.json();

console.log(contact.phone);       // "+90 312 000 00 00"
console.log(contact.email);       // "info@cevikemlak.com"
console.log(contact.mapLatitude); // 39.9255
console.log(contact.social);      // [{ id, platform, url }, ...]
```

### Harita Entegrasyonu (Leaflet örneği)

```js
if (contact.mapLatitude && contact.mapLongitude) {
  const map = L.map('map').setView(
    [contact.mapLatitude, contact.mapLongitude],
    contact.mapZoom
  );
  L.marker([contact.mapLatitude, contact.mapLongitude]).addTo(map);
}
```

### Sosyal Medya Linkleri

```js
contact.social.forEach(({ platform, url }) => {
  console.log(`${platform}: ${url}`);
});
```

---

## Notlar

- Veritabanında hiç kayıt yoksa `GET` isteği otomatik olarak boş bir doküman oluşturur; frontend her zaman bir `contact` objesi alır, `null` dönmez.
- `mapLatitude` ve `mapLongitude` harita bağlantısı kurulmamışsa `null` gelir; harita render etmeden önce kontrol edilmeli.
- `mapZoom` her zaman 1–21 arasında bir tam sayıdır.
