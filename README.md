# Cevik Emlak Backend

Express + Mongoose API. Icerikler admin panelinden yonetilir, frontend `/api/v1/listings` uzerinden ilanlari ceker.

## Kurulum

```bash
cd backend
cp .env.example .env
npm install
npm run seed
npm run dev
```

Varsayilan admin:

- E-posta: `admin@cevikemlak.test`
- Sifre: `admin12345`

## Upload

`STORAGE_DRIVER=local` dosyalari `backend/uploads` altina yazar.
S3 icin `STORAGE_DRIVER=s3`, bucket ve AWS degiskenlerini doldurun.

## Endpoint Prefix

Tum API endpointleri `/api/v1` altindadir.

- `GET /api/v1/health`
- `POST /api/v1/auth/login`
- `GET /api/v1/categories`
- `GET /api/v1/listings`
- `POST /api/v1/listings/:id/view`
