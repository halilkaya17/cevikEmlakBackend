# Mesajlar API — iletişim formları

Site ziyaretçilerinin gönderdiği mesajlar `messages` koleksiyonunda saklanır. Admin panel **Mesajlar** sayfası bu endpoint’leri kullanır.

- Public POST: kimlik doğrulama yok, dakikada en fazla **10** istek (IP).
- Admin GET/PATCH: `Authorization: Bearer <token>` zorunlu.

---

## 1) İlan bilgi talebi

```http
POST /api/v1/messages/listing-inquiry
Content-Type: application/json
```

| Alan | Alternatif | Zorunlu |
|------|------------|---------|
| Ad soyad | `fullName`, `adSoyad`, `name` | Evet |
| Telefon | `phone`, `telefon` | Evet |
| E-posta | `email`, `mail` | Evet |
| İlan | `listingId`, `listing`, `ilanId`, `id` | Evet (`_id`, `slug` veya `listingNo`) |
| Not | `message`, `body` | Hayır |

Örnek:

```json
{
  "fullName": "Ali Veli",
  "phone": "05551234567",
  "email": "ali@ornek.com",
  "listingId": "664a1c2f3d8b4e001a2b3c4d"
}
```

**201 Created**

```json
{
  "ok": true,
  "message": {
    "id": "...",
    "type": "listing_inquiry",
    "fullName": "Ali Veli",
    "phone": "05551234567",
    "email": "ali@ornek.com",
    "listing": "664a1c2f3d8b4e001a2b3c4d",
    "listingSnapshot": {
      "id": "664a1c2f3d8b4e001a2b3c4d",
      "listingNo": "2024001",
      "title": "3+1 Daire",
      "slug": "3-1-daire-2024001"
    },
    "subject": "",
    "body": "",
    "read": false,
    "readAt": null,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

## 2) İletişim sayfası formu

```http
POST /api/v1/messages/contact
Content-Type: application/json
```

| Alan | Alternatif | Zorunlu |
|------|------------|---------|
| Ad soyad | `fullName`, `adSoyad`, `name` | Evet |
| Telefon | `phone`, `telefon` | Evet |
| E-posta | `email`, `mail` | Evet |
| Konu | `subject`, `konu` | Evet (1–200 karakter) |
| Mesaj | `message`, `body`, `mesaj` | Evet (5–5000 karakter) |

Örnek:

```json
{
  "fullName": "Ayşe Yılmaz",
  "phone": "+90 532 000 00 00",
  "email": "ayse@ornek.com",
  "subject": "Genel bilgi",
  "message": "Merhaba, portföyünüz hakkında bilgi almak istiyorum."
}
```

**201 Created** — `type: "contact"`, `listing` / `listingSnapshot` null.

---

## 3) Admin — liste

```http
GET /api/v1/messages
Authorization: Bearer <token>
```

| Query | Açıklama |
|-------|----------|
| `type` | `listing_inquiry` veya `contact` |
| `read` | `true` / `false` |
| `page` | Varsayılan `1` |
| `limit` | Varsayılan `20`, max `100` |

**200 OK**

```json
{
  "messages": [ /* ... */ ],
  "unreadCount": 3,
  "pagination": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

Sıralama: okunmamış önce değil; `read` asc, sonra `createdAt` desc (okunmamışlar `read: false` üstte).

---

## 4) Admin — tekil

```http
GET /api/v1/messages/:id
Authorization: Bearer <token>
```

---

## 5) Admin — okundu işaretle

```http
PATCH /api/v1/messages/:id/read
Authorization: Bearer <token>
```

Body gerekmez. `read: true`, `readAt` güncellenir.

**200 OK** — güncel `message` objesi döner.

---

## `type` değerleri

| `type` | Kaynak |
|--------|--------|
| `listing_inquiry` | İlan detay / bilgi al formu |
| `contact` | İletişim sayfası formu |
