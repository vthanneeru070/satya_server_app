# Satya Server Auth Backend

Production-grade authentication and authorization backend built with Node.js, Express, MongoDB, Firebase Admin SDK, JWT, and Swagger.

## Features

- Firebase ID token based login (`phone`, `google`, `apple`)
- Backend JWT auth with access token (15m) and refresh token (7d)
- MongoDB-backed refresh token invalidation
- Role-based access control (`user`, `admin`)
- Super admin bootstrap script and admin audit logging
- Security middleware: `helmet`, `cors`, `express-rate-limit`
- Request logging with `morgan`
- OpenAPI 3 docs with Swagger UI at `/api-docs`
- API versioning with `/api/v1`
- Consistent response format

## Project Structure

```
src/
  controllers/
  routes/
  models/
  middleware/
  config/
  utils/
  validations/
  app.js
  server.js
```

## Setup

1. Install dependencies:
   - `npm install`
2. Create environment files:
   - `.env.development`
   - `.env.test`
   - `.env.production`
   - You can use `.env.example` as a template for each.
3. Set `NODE_ENV` in each environment file and fill Firebase/service secrets.
4. Start server:
   - Development: `npm run dev`
   - Production: `npm start`

### Environment File Resolution

- App loads `.env.<NODE_ENV>` first (for example, `.env.development`)
- Then falls back to `.env` for any missing keys
- Example:
  - `NODE_ENV=development` -> `.env.development`
  - `NODE_ENV=test` -> `.env.test`
  - `NODE_ENV=production` -> `.env.production`

## Environment Variables

- `PORT`
- `MONGO_URI`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (keep escaped newlines, as shown in `.env.example`)
- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_FIREBASE_UID`
- `SUPER_ADMIN_PROVIDER` (optional, default: `google`)

## API Base URLs

- API Base: `/api/v1`
- Swagger Docs: `/api-docs`

## Endpoints

### Auth

- `POST /api/v1/auth/login`
  - Header: `Authorization: Bearer <firebase_id_token>`
- `POST /api/v1/auth/admin/login`
  - Header: `Authorization: Bearer <firebase_id_token>`
  - Requires user role to be `admin` in MongoDB
- `POST /api/v1/auth/refresh`
  - Body: `{ "refreshToken": "..." }`
- `POST /api/v1/auth/logout`
  - Body: `{ "refreshToken": "..." }`
- `GET /api/v1/auth/profile`
  - Header: `Authorization: Bearer <access_token>`

### Admin

- `POST /api/v1/admin/create-admin`
  - Header: `Authorization: Bearer <access_token>`
  - Body: `{ "email": "user@example.com" }`
  - Requires `super admin`
- `GET /api/v1/admin/users?page=1&limit=10&search=example`
  - Header: `Authorization: Bearer <access_token>`
  - Requires `admin` role
- `PATCH /api/v1/admin/remove-admin/:id`
  - Header: `Authorization: Bearer <access_token>`
  - Requires `super admin`

## Super Admin Bootstrap

Run once in each environment to initialize a super admin:

- `npm run create:super-admin`

The script is idempotent: if a super admin already exists, it will exit without creating another.

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

## Important Security Notes

- Never trust client payload for identity; Firebase token is always verified in backend.
- Keep JWT secrets and Firebase private key only in environment variables.
- Always use HTTPS in production.
- Tune CORS origin whitelist and rate limits for your environment.
