# İlan medya & görseller — Frontend rehberi

Bu doküman, ilan görselleri/videoları, kapak fotoğrafı, ana sayfa öne çıkan projeler ve ilgili API’ler için frontend ekibine yöneliktir.

**Base URL:** `https://<backend-host>/api/v1`  
**Local:** `http://localhost:5001/api/v1`

---

## 1. Özet: hangi endpoint ne döner?

| Endpoint | Auth | `images` dizisi | `gallery` | `cardImage` | Video `type` |
|----------|------|-----------------|-----------|-------------|--------------|
| `GET /listings/detail/:id` | Hayır | ✅ Normalize | ✅ (= `images`) | ✅ | ✅ |
| `GET /pages/home` → `listing` | Hayır | ✅ Normalize | ✅ (= `images`) | ✅ | ✅ |
| `GET /listings/cards` | Hayır | ❌ | ❌ | ✅ (tek URL) | — |
| `GET /listings/:id` (admin/ham) | Hayır | Ham DB (type eksik olabilir) | URL string[] | ✅ | Ham |

**Site (public) için kullan:**
- Detay sayfası → `GET /listings/detail/:id`
- Ana sayfa projeler → `GET /pages/home` içindeki `listing`
- Liste/kart → `GET /listings/cards`

---

## 2. Medya öğesi şeması (`images[]`)

Her ilanın `images` alanı bir dizi. Backend response’ta her öğe şu yapıdadır:

```ts
type ListingMediaItem = {
  url: string;           // Cloudinary veya public URL (zorunlu)
  publicId: string;      // Cloudinary public_id (opsiyonel, silme için)
  type: "image" | "video";
  alt: string;
  isCover: boolean;      // true → kapak fotoğrafı
};
```

### `type` fallback

Veritabanında eski kayıtlarda `type` yazılmamış olabilir.  
`GET /listings/detail/:id` ve ana sayfa `listing` objesinde backend **`type` yoksa `"image"`** döner.

### Kapak fotoğrafı

- **`isCover: true`** olan öğe kapaktır.
- Aynı zamanda üst seviyede hazır URL’ler vardır:
  - **`cardImage`** — liste/kart için tek görsel URL
  - **`heroImage`** — detay üst banner için tek görsel URL
- Kapak seçimi backend’de: `isCover && type !== "video"` → yoksa ilk `type !== "video"` → yoksa dizinin ilk elemanı.
- Kapak **video** ise `cardImage` / `heroImage` **`null`** gelir; UI’da `images` içinden bir görsel seç veya placeholder kullan.

```ts
function getCoverUrl(listing: { images?: ListingMediaItem[]; cardImage?: string | null }) {
  if (listing.cardImage) return listing.cardImage;
  const cover = listing.images?.find((i) => i.isCover && i.type !== "video")
    ?? listing.images?.find((i) => i.type !== "video");
  return cover?.url ?? null;
}
```

### `gallery` vs `images`

İkisi de **aynı normalize edilmiş dizidir**. Geriye dönük uyumluluk için ikisi birden gelir. Yeni kodda **`listing.images`** kullanın.

---

## 3. Görsel / video yükleme (admin)

```http
POST /api/v1/media
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

| Alan | Değer |
|------|--------|
| `files` | Bir veya birden fazla dosya (max 20) |

**Boyut limitleri:**

| Tür | Max |
|-----|-----|
| Görsel (`image/*`) | 20 MB |
| Video (`video/*`) | 150 MB |

**Response (201):**

```json
{
  "assets": [
    {
      "url": "https://res.cloudinary.com/.../video.mp4",
      "mimeType": "video/mp4",
      "type": "video",
      "kind": "video",
      "size": 12345678
    }
  ]
}
```

İlan kaydederken bu `url` (ve varsa `publicId`) değerlerini `images` dizisine koyun; `type` alanını upload cevabından veya MIME’dan set edin.

**Query:** `?save=false` → sadece Cloudinary’e yükler, medya kütüphanesine kaydetmez.

---

## 4. İlan kaydetme / güncelleme (admin)

```http
POST /api/v1/listings
PUT  /api/v1/listings/:id
Authorization: Bearer <token>
Content-Type: application/json
```

**`images` body örneği:**

```json
{
  "images": [
    {
      "url": "https://res.cloudinary.com/.../cover.webp",
      "publicId": "cevik-emlak/cover",
      "type": "image",
      "alt": "Salon",
      "isCover": true
    },
    {
      "url": "https://res.cloudinary.com/.../tanitim.mp4",
      "publicId": "cevik-emlak/tanitim",
      "type": "video",
      "alt": "",
      "isCover": false
    }
  ]
}
```

**Kurallar (önerilen UI):**

- En az bir öğede `isCover: true` olsun (tercihen `type: "image"`).
- Birden fazla `isCover: true` olmamalı; backend sonuncuyu kazanır gibi davranabilir — tek kapak seçtirin.
- Video kapak yapılmamalı (`isCover` + `type: "video"` → `cardImage` null).
- `type` gönderilmezse DB’de alan boş kalabilir; okurken API yine `"image"` fallback verir.

---

## 5. İlan detay API

```http
GET /api/v1/listings/detail/:id
```

`:id` → MongoDB `_id`, `slug` veya `listingNo`.

**Response:**

```json
{
  "listing": {
    "id": "...",
    "listingNo": "CE-001",
    "slug": "...",
    "title": "...",
    "cardImage": "https://...",
    "heroImage": "https://...",
    "images": [
      {
        "url": "https://res.cloudinary.com/.../cover.webp",
        "publicId": "",
        "type": "image",
        "alt": "",
        "isCover": true
      },
      {
        "url": "https://res.cloudinary.com/.../clip.mp4",
        "publicId": "cevik-emlak/clip",
        "type": "video",
        "alt": "",
        "isCover": false
      }
    ],
    "gallery": [ "/* images ile aynı */" ],
    "contentGallery": [
      { "url": "...", "publicId": "", "caption": "" }
    ],
    "floorPlans": [ ... ],
    "agent": {
      "name": "...",
      "mobilePhone": "...",
      "officePhone": "...",
      "email": "...",
      "photo": "..."
    },
    "propertyGroups": [ ... ]
  }
}
```

### UI render örneği

```tsx
{listing.images?.map((item, i) =>
  item.type === "video" ? (
    <video key={i} src={item.url} controls playsInline />
  ) : (
    <img key={i} src={item.url} alt={item.alt || listing.title} />
  )
)}
```

---

## 6. Ana sayfa — öne çıkan projeler

```http
GET /api/v1/pages/home
```

`featured` → `projects` bloğu (`type: "featured-project-list"`):

```json
{
  "page": {
    "pageKey": "home",
    "sections": [
      {
        "key": "featured",
        "blocks": [
          {
            "key": "projects",
            "type": "featured-project-list",
            "value": [
              {
                "id": "1",
                "listingId": "CE-001",
                "title": "CMS başlık (isteğe bağlı)",
                "description": "CMS açıklama",
                "listing": {
                  "images": [ "/* detay ile aynı normalize dizi */" ],
                  "gallery": [ "/* = images */" ],
                  "cardImage": "...",
                  "heroImage": "...",
                  "...": "GET /listings/detail ile aynı tam ilan objesi"
                }
              }
            ]
          }
        ]
      }
    ]
  }
}
```

**Önemli:**

- CMS satırında sadece `id`, `listingId`, `title`, `description` saklanır; görseller **`listing`** altında gelir.
- `listingId` eşleşmezse veya ilan `active: false` ise → **`listing: null`**.
- Slider / hero için: `listing.images` veya `listing.cardImage`.
- Proje kartı galerisi: `listing.images` (tüm medya, video dahil).

---

## 7. Liste / kart API

```http
GET /api/v1/listings/cards?page=1&limit=12&q=kadıköy
```

Kart response’unda **sadece** `cardImage` (tek URL) vardır; tam `images` dizisi **gelmez**.

Arama `q` parametresi: `listingNo`, `title`, `city`, `district`, `summary` alanlarında (büyük/küçük harf duyarsız).

| Query | Örnek |
|-------|--------|
| `q` | `CE-001` veya `kadıköy` |
| `transactionType` | `satilik` \| `kiralik` |
| `category` | kategori slug |
| `city`, `district`, `rooms` | filtre |
| `priceMin`, `priceMax` | fiyat |
| `areaMin`, `areaMax` | m² |
| `sortBy` | `newest`, `oldest`, `price-asc`, `price-desc`, `area-asc`, `area-desc` |
| `page`, `limit` | sayfalama (limit max 50) |

Detay veya galeri için kart tıklanınca `GET /listings/detail/:slug` çağırın.

---

## 8. Diğer medya alanları (karıştırmayın)

| Alan | Amaç |
|------|------|
| **`images`** | İlan galerisi (foto + video), kapak `isCover` |
| **`contentGallery`** | İçerik/editöryal galeri (`caption` var, `isCover` yok) |
| **`floorPlans`** | Kat planları (`type` + `images[]` alt yapı) |
| **`documents`** | PDF vb. belgeler |

Bunlar birbirinin yerine kullanılmamalı.

---

## 9. TypeScript tipleri (öneri)

```ts
export type ListingMediaType = "image" | "video";

export interface ListingMediaItem {
  url: string;
  publicId: string;
  type: ListingMediaType;
  alt: string;
  isCover: boolean;
}

export interface ListingDetailPublic {
  id: string;
  listingNo: string;
  slug: string;
  title: string;
  cardImage: string | null;
  heroImage: string | null;
  images: ListingMediaItem[];
  gallery: ListingMediaItem[];
  contentGallery: { url: string; publicId: string; caption: string }[];
  agent: {
    _id: string;
    name: string;
    firstName: string;
    lastName: string;
    title: string;
    mobilePhone: string;
    officePhone: string;
    phones: string[];
    email: string;
    photo: string;
  };
  // ... diğer alanlar
}

export interface HomeFeaturedProjectRow {
  id: string;
  listingId: string;
  title: string;
  description: string;
  listing: ListingDetailPublic | null;
}
```

---

## 10. Kontrol listesi (frontend)

- [ ] Detay ve ana sayfa için `listing.images` kullan (`gallery` opsiyonel/legacy).
- [ ] `type === "video"` → `<video controls>`, değilse `<img>`.
- [ ] Kapak için `isCover` veya `cardImage` / `heroImage`.
- [ ] Admin upload sonrası `images[]` içine `type` set et.
- [ ] Video max 150 MB, görsel max 20 MB.
- [ ] Kart listesinde sadece `cardImage`; tam galeri için detail endpoint.
- [ ] `listing === null` (ana sayfa) için fallback UI.

---

## 11. Postman örnekleri

```http
GET http://localhost:5001/api/v1/listings/detail/CE-001
```

```http
GET http://localhost:5001/api/v1/pages/home
```

```http
GET http://localhost:5001/api/v1/listings/cards?q=CE-001&limit=8
```

```http
POST http://localhost:5001/api/v1/media
Authorization: Bearer <token>
# form-data: files = [image veya video]
```
