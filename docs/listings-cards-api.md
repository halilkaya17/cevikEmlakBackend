# İlan Kartları API — `GET /api/v1/listings/cards`

Kart listeleme ekranları için optimize edilmiş endpoint. Tam ilan detayı yerine sadece kartda gösterilecek alanları döner. Kimlik doğrulaması **gerekmez**.

---

## Request

```
GET /api/v1/listings/cards
```

### Query Parametreleri

#### Filtreleme

| Parametre | Tip | Açıklama | Örnek |
|---|---|---|---|
| `category` | string | Kategori slug'ına göre filtrele | `?category=konut` |
| `excludeCategory` | string | Bu kategorideki ilanları dışla | `?excludeCategory=proje` |
| `transactionType` | string | `satilik` veya `kiralik` | `?transactionType=kiralik` |
| `subcategory` | string | Alt kategori adı | `?subcategory=daire` |
| `city` | string | Şehir | `?city=Ankara` |
| `district` | string | İlçe | `?district=Çankaya` |
| `rooms` | string | Oda sayısı | `?rooms=3%2B1` |
| `priceMin` | number | Minimum fiyat | `?priceMin=500000` |
| `priceMax` | number | Maksimum fiyat | `?priceMax=3000000` |
| `areaMin` | number | Minimum net m² | `?areaMin=80` |
| `areaMax` | number | Maksimum net m² | `?areaMax=200` |
| `q` | string | Tam metin arama | `?q=bahçeli` |

#### Sayfalama

| Parametre | Varsayılan | Sınır | Açıklama |
|---|---|---|---|
| `page` | `1` | min 1 | Sayfa numarası |
| `limit` | `8` | 1–50 | Sayfa başına ilan sayısı |

#### Sıralama (`sortBy`)

| Değer | Açıklama |
|---|---|
| `newest` *(varsayılan)* | En yeni önce |
| `oldest` | En eski önce |
| `price-asc` | En ucuz önce |
| `price-desc` | En pahalı önce |
| `area-asc` | En küçük m² önce |
| `area-desc` | En büyük m² önce |

---

## Response — `200 OK`

```json
{
  "listings": [ /* Kart objeleri dizisi */ ],
  "pagination": {
    "total": 84,
    "page": 1,
    "limit": 8,
    "totalPages": 11
  },
  "categories": [
    { "slug": "arsa",  "count": 4  },
    { "slug": "konut", "count": 31 },
    { "slug": "proje", "count": 7  }
  ]
}
```

---

## Tam Kart Objesi Örneği

```json
{
  "listings": [
    {
      "id": "664a1c2f3d8b4e001a2b3c4d",
      "listingNo": "2024001",
      "slug": "cankayada-3-1-satilik-daire-2024001",
      "title": "Çankaya'da 3+1 Satılık Daire",
      "transactionType": "satilik",
      "status": "published",
      "categorySlug": "konut",
      "subcategory": "daire",
      "price": 4500000,
      "currency": "TRY",
      "city": "Ankara",
      "district": "Çankaya",
      "districtText": "Ankara/Çankaya",
      "areaNet": 120,
      "areaGross": 145,
      "rooms": "3+1",
      "badges": [
        { "text": "Satılık", "variant": "kiralik" }
      ],
      "cardImage": "https://res.cloudinary.com/cevik/image/upload/cover.jpg",
      "agent": {
        "name": "Ahmet Çevik",
        "phones": ["+90 532 000 00 00"],
        "photo": "https://res.cloudinary.com/cevik/image/upload/agent.jpg"
      },
      "propertyGroups": [
        {
          "groupKey": "temel_ozellikler",
          "groupLabel": "Temel Özellikler",
          "properties": [
            { "key": "oda_sayisi",  "label": "Oda Sayısı",  "icon": "bed",      "unit": "",    "value": "3+1"   },
            { "key": "bina_yasi",   "label": "Bina Yaşı",   "icon": "building", "unit": "yıl", "value": "5"     },
            { "key": "kat",         "label": "Kat",          "icon": "layers",   "unit": "",    "value": "3"     }
          ]
        },
        {
          "groupKey": "ic_ozellikler",
          "groupLabel": "İç Özellikler",
          "properties": [
            { "key": "isitma_tipi", "label": "Isıtma Tipi", "icon": "flame", "unit": "", "value": "Kombi" }
          ]
        }
      ]
    }
  ],
  "pagination": {
    "total": 84,
    "page": 1,
    "limit": 8,
    "totalPages": 11
  },
  "categories": [
    { "slug": "konut", "count": 31 },
    { "slug": "arsa",  "count": 4  }
  ]
}
```

---

## Alan Açıklamaları

### Kart Alanları

| Alan | Tip | Açıklama |
|---|---|---|
| `id` | string | MongoDB ID |
| `listingNo` | string | İlan numarası |
| `slug` | string | Detay sayfası URL parçası |
| `title` | string | İlan başlığı |
| `transactionType` | string | `satilik` / `kiralik` |
| `categorySlug` | string | Kategori slug'ı |
| `subcategory` | string | Alt kategori |
| `price` | number | Fiyat |
| `currency` | string | Para birimi (`TRY`) |
| `city` | string | Şehir |
| `district` | string | İlçe |
| `districtText` | string | `"Ankara/Çankaya"` — kart için hazır birleşik metin |
| `areaNet` | number \| null | Net m² |
| `areaGross` | number \| null | Brüt m² |
| `rooms` | string | Oda sayısı |
| `badges` | array | Rozetler `[{ text, variant }]` |
| `cardImage` | string | Kapak görseli URL (yoksa `/ilan-mini-resim.png`) |
| `agent.name` | string | Danışman adı |
| `agent.phones` | string[] | Danışman telefon numaraları |
| `agent.photo` | string | Danışman fotoğrafı URL |

### `propertyGroups` — Gruplu Özellikler

Kategoride **`showOnCard: true`** işaretli ve değeri dolu olan alanlar, tanımlı grup adlarıyla birlikte gelir.

| Alan | Tip | Açıklama |
|---|---|---|
| `groupKey` | string | Grubun anahtar adı |
| `groupLabel` | string | Grubun tam görünen adı |
| `properties[]` | array | Grup içindeki özellikler |
| `properties[].key` | string | Alan anahtar adı |
| `properties[].label` | string | Alanın tam görünen adı |
| `properties[].icon` | string | Kategori yönetiminde tanımlanan ikon değeri |
| `properties[].unit` | string | Birim (örn. `"m²"`, `"yıl"`) — boşsa `""` |
| `properties[].value` | any | Alanın değeri |

> `propertyGroups` boş array olabilir — kategoride `showOnCard: true` alan yoksa ya da hiç değer girilmemişse.

---

## Pagination Objesi

```json
"pagination": {
  "total": 84,       // Filtreye uyan toplam ilan sayısı
  "page": 1,         // Mevcut sayfa
  "limit": 8,        // Sayfa başına ilan
  "totalPages": 11   // Toplam sayfa sayısı
}
```

## Categories Objesi

Mevcut filtreye göre hangi kategoride kaç ilan olduğunu döner. Kategori filtre butonlarını ve sayaçlarını doldurmak için kullanılır.

```json
"categories": [
  { "slug": "konut", "count": 31 },
  { "slug": "arsa",  "count": 4  },
  { "slug": "proje", "count": 7  }
]
```

---

## Örnek İstekler

### Ankara satılık ilanlar, 2. sayfa

```
GET /api/v1/listings/cards?transactionType=satilik&city=Ankara&page=2&limit=12
```

### Konut kategorisi, 3+1, fiyat aralığı

```
GET /api/v1/listings/cards?category=konut&rooms=3%2B1&priceMin=1000000&priceMax=3000000
```

### En yeni projeler

```
GET /api/v1/listings/cards?category=proje&sortBy=newest&limit=6
```

---

## Frontend Kullanım Örneği (JavaScript / Fetch)

```js
async function fetchListingCards(params = {}) {
  const url = new URL('https://<domain>/api/v1/listings/cards');
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('İlanlar alınamadı');
  return res.json(); // { listings, pagination }
}

// Kullanım
const { listings, pagination } = await fetchListingCards({
  transactionType: 'satilik',
  category: 'konut',
  page: 1,
  limit: 12,
  sortBy: 'newest',
});

// Kart render
listings.forEach(listing => {
  console.log(listing.title);        // "Çankaya'da 3+1 Satılık Daire"
  console.log(listing.districtText); // "Ankara/Çankaya"
  console.log(listing.cardImage);    // Kapak görsel URL
  console.log(listing.price);        // 4500000

  // Özellik gruplarını render et
  listing.propertyGroups.forEach(group => {
    console.log(group.groupLabel); // "Temel Özellikler"
    group.properties.forEach(prop => {
      const display = prop.unit ? `${prop.value} ${prop.unit}` : prop.value;
      console.log(`${prop.label}: ${display}`); // "Bina Yaşı: 5 yıl"
    });
  });
});

// Sayfalama
const hasNext = pagination.page < pagination.totalPages;
const hasPrev = pagination.page > 1;
```

---

## `GET /api/v1/listings` ile Farkı

| | `/listings` | `/listings/cards` |
|---|---|---|
| Amaç | Tam ilan verisi + filtre seçenekleri | Sadece kart için gerekli alanlar |
| `propertyValues` | Ham key→value objesi | Gruplu, label+icon+unit ile birlikte |
| `categories` | `filters.categories` içinde | Üst seviyede ayrı alan olarak |
| `filters` | Var (subcategories, rooms, locations…) | **Yok** |
| `description`, `highlights` | Var | **Yok** |
| `gallery`, `heroImage` | Var | **Yok** — sadece `cardImage` |
| `images`, `floorPlans`, `documents` | Var | **Yok** |
