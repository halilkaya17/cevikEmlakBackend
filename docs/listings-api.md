# İlanlar API Dokümantasyonu

**Base URL:** `https://<domain>/api/v1/listings`

---

## 1. İlan Listesi — Filtreleme & Sayfalama

Herkese açık. Kimlik doğrulaması **gerekmez**.

### Request

```
GET /api/v1/listings
```

### Query Parametreleri

#### Filtreleme

| Parametre | Tip | Açıklama | Örnek |
|---|---|---|---|
| `category` | string | Kategori slug'ına göre filtrele | `?category=konut` |
| `excludeCategory` | string | Bu slug'a sahip kategorileri dışla | `?excludeCategory=arsa` |
| `transactionType` | string | `satilik` veya `kiralik` | `?transactionType=satilik` |
| `subcategory` | string | Alt kategori adı | `?subcategory=daire` |
| `city` | string | Şehir adı | `?city=Ankara` |
| `district` | string | İlçe adı | `?district=Çankaya` |
| `rooms` | string | Oda sayısı | `?rooms=3%2B1` |
| `priceMin` | number | Minimum fiyat (₺) | `?priceMin=500000` |
| `priceMax` | number | Maksimum fiyat (₺) | `?priceMax=2000000` |
| `areaMin` | number | Minimum net m² | `?areaMin=80` |
| `areaMax` | number | Maksimum net m² | `?areaMax=200` |
| `q` | string | Tam metin arama (başlık, şehir, ilçe, özet) | `?q=bahçeli` |
| `status` | string | `published` (varsayılan) veya `all` | `?status=published` |

#### Sayfalama

| Parametre | Tip | Varsayılan | Sınır | Açıklama |
|---|---|---|---|---|
| `page` | number | `1` | min 1 | Sayfa numarası |
| `limit` | number | `8` | 1–50 | Sayfa başına ilan sayısı |

#### Sıralama

| Parametre (`sortBy`) | Açıklama |
|---|---|
| `newest` *(varsayılan)* | En yeni yayınlananlar önce |
| `oldest` | En eski yayınlananlar önce |
| `price-asc` | En düşük fiyat önce |
| `price-desc` | En yüksek fiyat önce |
| `area-asc` | En küçük m² önce |
| `area-desc` | En büyük m² önce |

---

### Response — `200 OK`

```json
{
  "listings": [ /* İlan objeleri dizisi */ ],
  "pagination": {
    "total": 84,
    "page": 1,
    "limit": 8,
    "totalPages": 11
  },
  "filters": {
    "categories": [
      { "slug": "arsa",  "count": 4  },
      { "slug": "konut", "count": 31 },
      { "slug": "proje", "count": 7  }
    ],
    "subcategories": ["daire", "villa", "müstakil ev"],
    "rooms": ["1+1", "2+1", "3+1", "4+1"],
    "locations": [
      { "city": "Ankara", "district": "Çankaya", "label": "Ankara/Çankaya" },
      { "city": "Ankara", "district": "Keçiören", "label": "Ankara/Keçiören" }
    ],
    "priceRange": {
      "min": 450000,
      "max": 12500000
    }
  }
}
```

---

### İlan Objesi Alanları

Her `listings[]` elemanı aşağıdaki alanları içerir:

#### Temel Bilgiler

| Alan | Tip | Açıklama |
|---|---|---|
| `_id` | string | MongoDB ID |
| `id` | string | `_id` ile aynı, pratik kullanım için |
| `listingNo` | string | İlan numarası (benzersiz) |
| `slug` | string | SEO dostu URL parçası |
| `title` | string | İlan başlığı |
| `status` | string | `draft` / `published` / `archived` |
| `transactionType` | string | `satilik` / `kiralik` |
| `active` | boolean | Aktif/pasif durumu |
| `publishedAt` | string (ISO date) \| null | Yayın tarihi |
| `createdAt` | string (ISO date) | Oluşturulma tarihi |
| `updatedAt` | string (ISO date) | Güncellenme tarihi |

#### Fiyat

| Alan | Tip | Açıklama |
|---|---|---|
| `price` | number | Fiyat |
| `currency` | string | Para birimi (varsayılan: `"TRY"`) |

#### Konum

| Alan | Tip | Açıklama |
|---|---|---|
| `city` | string | Şehir |
| `district` | string | İlçe |
| `neighborhood` | string | Mahalle |
| `address` | string | Tam adres |
| `locationText` | string | Serbest konum metni |
| `coordinates.lat` | number \| null | Enlem |
| `coordinates.lng` | number \| null | Boylam |
| `districtText` | string | `"Ankara/Çankaya"` — kart için hazır metin |
| `detailLocation` | string | `"Ankara / Çankaya / Kızılay"` — detay sayfası için |

#### Emlak Özellikleri

| Alan | Tip | Açıklama |
|---|---|---|
| `category` | object | Dolu kategori objesi (populate) |
| `categorySlug` | string | Kategori slug'ı |
| `subcategory` | string | Alt kategori |
| `areaGross` | number \| null | Brüt m² |
| `areaNet` | number \| null | Net m² |
| `rooms` | string | Oda sayısı (örn. `"3+1"`) |
| `salons` | string | Salon sayısı |
| `bathrooms` | string | Banyo sayısı |
| `summary` | string | Kısa özet |
| `description` | string | Uzun açıklama (HTML olabilir) |
| `highlights` | string[] | Öne çıkan özellikler |
| `propertyValues` | object | Kategoriye özel ek özellikler (key-value) |
| `badges` | array | Rozet listesi `[{ text, variant }]` |

#### Görseller

| Alan | Tip | Açıklama |
|---|---|---|
| `cardImage` | string | Kart görselinin URL'i (kapak yoksa varsayılan) |
| `heroImage` | string | Detay sayfası hero görselinin URL'i |
| `gallery` | string[] | Tüm görsellerin URL dizisi |
| `images` | array | Ham görsel listesi `[{ url, alt, isCover }]` |
| `floorPlans` | array | Kat planları `[{ type, images: [{ url }] }]` |
| `documents` | array | Belgeler `[{ name, url, format }]` |

#### Danışman & İstatistik

| Alan | Tip | Açıklama |
|---|---|---|
| `agent` | object | Dolu danışman objesi (populate) |
| `viewCount` | number | Görüntülenme sayısı |

---

### Pagination Objesi

```json
"pagination": {
  "total": 84,        // Filtreye uyan toplam ilan sayısı
  "page": 2,          // Mevcut sayfa
  "limit": 8,         // Sayfa başına ilan
  "totalPages": 11    // Toplam sayfa sayısı
}
```

---

### Filters Objesi

Her istekte mevcut filtreye göre **dinamik** olarak hesaplanır (fiyat ve alan aralığı hariç). Frontend'de filtre dropdown'larını doldurmak için kullanılır.

```json
"filters": {
  "categories": [                                // İlan bulunan kategoriler ve ilan sayıları
    { "slug": "konut", "count": 31 },
    { "slug": "arsa",  "count": 4  }
  ],
  "subcategories": ["daire", "villa"],          // Mevcut sonuçlardaki alt kategoriler
  "rooms": ["1+1", "2+1", "3+1"],               // Mevcut sonuçlardaki oda seçenekleri
  "locations": [                                 // Mevcut sonuçlardaki şehir/ilçe çiftleri
    { "city": "Ankara", "district": "Çankaya", "label": "Ankara/Çankaya" }
  ],
  "priceRange": {                                // Mevcut sonuçlardaki fiyat aralığı
    "min": 450000,
    "max": 12500000
  }
}
```

---

## Örnek İstekler

### Sayfa 2 — Ankara'daki satılık ilanlar, fiyata göre artan

```
GET /api/v1/listings?transactionType=satilik&city=Ankara&sortBy=price-asc&page=2&limit=12
```

### Konut kategorisi, 3+1, bütçe 1M–3M

```
GET /api/v1/listings?category=konut&rooms=3%2B1&priceMin=1000000&priceMax=3000000
```

### Metin araması + alan filtresi

```
GET /api/v1/listings?q=bahçeli&areaMin=100&areaMax=250&sortBy=area-asc
```

---

## Frontend Kullanım Örnekleri (JavaScript / Fetch)

### Temel İlan Listesi Çekme

```js
async function fetchListings(params = {}) {
  const url = new URL('https://<domain>/api/v1/listings');
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Sunucu hatası');
  return res.json(); // { listings, pagination, filters }
}

// Kullanım
const { listings, pagination, filters } = await fetchListings({
  transactionType: 'satilik',
  city: 'Ankara',
  page: 1,
  limit: 12,
  sortBy: 'newest',
});
```

### Sayfalama Kontrolü

```js
// Sonraki sayfa var mı?
const hasNextPage = pagination.page < pagination.totalPages;

// Önceki sayfa var mı?
const hasPrevPage = pagination.page > 1;

// Toplam sonuç
console.log(`${pagination.total} ilan bulundu, ${pagination.totalPages} sayfa`);
```

### Filtre Dropdown'larını Doldurma

```js
const { filters } = await fetchListings({ category: 'konut' });

// İlan bulunan kategoriler ve sayıları
filters.categories.forEach(({ slug, count }) => {
  console.log(`${slug}: ${count} ilan`); // "konut: 31 ilan"
});

// Oda sayısı seçenekleri
filters.rooms.forEach(room => {
  console.log(room); // "1+1", "2+1", "3+1" ...
});

// Şehir/İlçe seçenekleri
filters.locations.forEach(({ city, district, label }) => {
  console.log(label); // "Ankara/Çankaya"
});

// Fiyat slider min/max
const { min, max } = filters.priceRange;
```

### Kart Görseli ve Konum

```js
listings.forEach(listing => {
  console.log(listing.cardImage);      // Kart resmi URL
  console.log(listing.districtText);   // "Ankara/Çankaya"
  console.log(listing.price);          // 1500000
  console.log(listing.rooms);          // "3+1"
});
```

---

## 2. Tek İlan Detayı

```
GET /api/v1/listings/:id
```

`:id` alanı; MongoDB `_id`, ilan `slug`'ı veya `listingNo` olabilir.

### Response — `200 OK`

```json
{
  "listing": { /* Yukarıdaki tam ilan objesi */ }
}
```

**404** — İlan bulunamadı veya aktif değil.

---

## 3. Görüntülenme Sayısını Artır

```
POST /api/v1/listings/:id/view
```

Aynı ziyaretçiden gelen tekrar istekler sayılmaz (fingerprint ile tekilleştirilir).

### Response — `200 OK`

```json
{
  "viewCount": 47
}
```
