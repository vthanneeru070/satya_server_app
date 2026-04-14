# Satya Server Auth Backend

Production-grade authentication and authorization backend built with Node.js, Express, MongoDB, Firebase Admin SDK, JWT, and Swagger.

## Features

- Firebase ID token based login (`phone`, `google`, `apple`)
- Backend JWT auth with access token (15m) and refresh token (7d)
- MongoDB-backed refresh token invalidation
- Role-based access control (`user`, `admin`)
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
2. Create env file:
   - Copy `.env.example` to `.env`
3. Fill Firebase service account and secrets in `.env`.
4. Start server:
   - Development: `npm run dev`
   - Production: `npm start`

## Environment Variables

- `PORT`
- `MONGO_URI`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (keep escaped newlines, as shown in `.env.example`)

## API Base URLs

- API Base: `/api/v1`
- Swagger Docs: `/api-docs`

## Endpoints

### Auth

- `POST /api/v1/auth/login`
  - Header: `Authorization: Bearer <firebase_id_token>`
- `POST /api/v1/auth/refresh`
  - Body: `{ "refreshToken": "..." }`
- `POST /api/v1/auth/logout`
  - Body: `{ "refreshToken": "..." }`
- `GET /api/v1/auth/profile`
  - Header: `Authorization: Bearer <access_token>`

### Admin

- `GET /api/v1/admin/users?page=1&limit=10`
  - Header: `Authorization: Bearer <access_token>`
  - Requires `admin` role

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
