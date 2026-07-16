# Satya Server App

Backend for the Satya / Sathya spiritual lifestyle platform — auth, content (poojas, rituals, deities, festivals), ecommerce, payments, and notifications.

Built with **Node.js**, **Express**, **MongoDB**, **Firebase Admin**, **JWT**, **AWS S3**, and **Swagger**.

## Features

- Firebase ID token login (`phone`, `google`, `apple`) + backend JWT (access / refresh)
- Role-based access (`user`, `admin`, `superadmin`)
- Content modules: Poojas, Rituals, Deities, Festivals, Daily Slokas, Donations
- Calendar (festivals, poojas, moon phases) and user home feed
- Ecommerce: inventory, products / pooja kits, cart, orders, replacements
- Payments via PayFast (ITN webhooks + landing pages)
- Push notifications (FCM) and in-app notifications
- Global search across content types
- Media uploads to S3 (images, audio, video, step images)
- OpenAPI docs at `/api-docs`
- Versioned APIs under `/api/v1`

## Project Structure

```
src/
  controllers/
  routes/
  models/
  middleware/
  services/
  config/
  utils/
  validations/
  masterdata/
  app.js
  server.js
scripts/          # bootstrap & seed scripts
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to environment files as needed:
   - `.env.development` / `.env` / `.env.production`
3. Fill MongoDB, JWT, Firebase, AWS S3, CORS, and PayFast values.
4. Start:
   - Development: `npm run dev`
   - Production: `npm start` or `npm run prod`

### Environment File Resolution

- Loads `.env.<NODE_ENV>` first (e.g. `.env.development`)
- Falls back to `.env` for any missing keys

## Environment Variables (high level)

| Variable | Purpose |
|----------|---------|
| `PORT` | Server port (default `3000`) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Access & refresh token secrets |
| `FIREBASE_*` | Firebase Admin credentials |
| `AWS_*` | S3 uploads |
| `CORS_ORIGINS` | Allowed browser origins |
| `PAYFAST_*` | Payment gateway |
| `SUPER_ADMIN_*` | Bootstrap super admin |

See `.env.example` for the full list.

## API Base URLs

- API: `/api/v1`
- Swagger UI: `/api-docs`
- PayFast return / cancel pages: `/payment-success`, `/payment-failed`

## Main Route Groups

| Prefix | Description |
|--------|-------------|
| `/api/v1/auth` | Login, refresh, logout, profile |
| `/api/v1/admin` | Admin users & dashboards |
| `/api/v1/superadmin` | Super-admin only |
| `/api/v1/poojas` | Pooja CRUD & review |
| `/api/v1/rituals` | Ritual CRUD & review |
| `/api/v1/deities` | Deity CRUD & review |
| `/api/v1/festivals` | Festival CRUD & review |
| `/api/v1/daily-slokas` | Daily sloka |
| `/api/v1/user-home` | Home feed (sloka, daily poojas, festivals…) |
| `/api/v1/calendar` | Month calendar |
| `/api/v1/search` | Global search |
| `/api/v1/products` / `/inventory` / `/cart` / `/orders` | Ecommerce |
| `/api/v1/payments` | PayFast & verify |
| `/api/v1/fcm` / `/notifications` | Push & notifications |

Full request/response schemas are in Swagger.

---

## Poojas (notable fields)

Create: `POST /api/v1/poojas/create-pooja` (admin, multipart)  
Update: `PATCH /api/v1/poojas/:id`  
List (admin all): `GET /api/v1/poojas/all?page=1&limit=10&search=&status=&daily=`

### Multiselect deity

`deity` is an array of Deity ObjectIds (required on create). Accepts JSON array, comma-separated ids, or single id.

```json
"deity": ["6a33cfce2b241b0035386ce2", "6a3ba4af6c52f88f1d007827"]
```

### Optional description & schedules

- `description` — optional (can be omitted or empty)
- `schedules` — optional array of `{ date, time }` (date: `dd-mm-yyyy`)

```json
"schedules": [
  { "date": "15-07-2026", "time": "09:30" },
  { "date": "16-07-2026", "time": "18:00" }
]
```

`date` alone still works as a backward-compatible alias for schedules.

### Daily poojas

- `daily` — boolean (default `false`)
- Auto-set to `true` when `category` is `"daily puja"` (case-insensitive)
- Approved daily poojas appear every day on user home (`dailyPoojas`) and on calendar months

### Ideal time

- `ideal_time` — string array (e.g. `["Morning", "Brahma Muhurta"]`)
- Accepts JSON array, comma-separated string, or single value

### List search

`search` is supported on:

- `GET /api/v1/poojas`, `/poojas/all`, `/poojas/my`
- Same pattern on **rituals**, **festivals**, and **deities** `/all` lists

---

## Rituals & Deities

- **Rituals:** `deity` is also multiselect (same formats as pooja)
- **Deities:** `GET /api/v1/deities/all?search=` filters by name, description, alternate names, roles

---

## Auth (quick reference)

- `POST /api/v1/auth/login` — `Authorization: Bearer <firebase_id_token>`
- `POST /api/v1/auth/admin/login` — admin/superadmin only
- `POST /api/v1/auth/refresh` — `{ "refreshToken": "..." }`
- `POST /api/v1/auth/logout` — `{ "refreshToken": "..." }`
- `GET /api/v1/auth/profile` — `Authorization: Bearer <access_token>`

## Super Admin Bootstrap

```bash
npm run create:super-admin
```

Idempotent — skips if a super admin already exists.

## Useful Scripts

| Script | Purpose |
|--------|---------|
| `npm run create:super-admin` | Bootstrap super admin |
| `npm run seed:moon` | Seed moon phase data |
| `npm run seed:inventory-categories` | Seed inventory categories |
| `npm run test:email` | Test email delivery |

## Response Format

Success:

```json
{
  "success": true,
  "data": {},
  "message": "Success"
}
```

Error:

```json
{
  "success": false,
  "message": "Error message"
}
```

## Security Notes

- Always verify Firebase ID tokens server-side; never trust client identity claims alone.
- Keep JWT secrets, Firebase private key, and payment credentials in env only.
- Use HTTPS in production.
- Configure `CORS_ORIGINS` and rate limits for your deployment.
