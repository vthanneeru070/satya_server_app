# Admin real-time notifications (FCM + MongoDB)

## Architecture

```
User pays (order / donation) or opens refund request
        ↓
adminNotificationService.recordAndNotify()
        ↓
AdminNotification saved (MongoDB, deduped by sourceKey)
        ↓
FCM multicast → all admin/superadmin fcmTokens
        ↓
Flutter Web Admin polls GET /admin/notifications
```

## Firebase Admin SDK (service account)

Set in `.env` (already used by `src/config/firebase.js`):

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Download JSON from Firebase Console → Project settings → Service accounts → Generate new private key. Map fields:

| JSON field | Env var |
|------------|---------|
| `project_id` | `FIREBASE_PROJECT_ID` |
| `client_email` | `FIREBASE_CLIENT_EMAIL` |
| `private_key` | `FIREBASE_PRIVATE_KEY` (escape newlines as `\n`) |

## FCM token registration (Flutter Web admin)

After admin login, obtain token and register:

```http
POST /api/v1/fcm/register
Authorization: Bearer <firebase_id_token>
Content-Type: application/json

{
  "token": "<fcm_registration_token>",
  "platform": "web",
  "deviceId": "chrome-tab-1"
}
```

**Response:**

```json
{
  "success": true,
  "message": "FCM token registered",
  "data": {
    "registered": true,
    "tokenCount": 2,
    "deviceCount": 2
  }
}
```

Call again on `onTokenRefresh`. On logout: `DELETE /api/v1/fcm/unregister` with `{ "token": "..." }`.

## Notification types

| `type` | When | FCM `data` keys |
|--------|------|-----------------|
| `NEW_ORDER` | Order payment verified (Paystack) | `orderId`, `orderNumber`, `totalAmount`, `currency`, … |
| `PAYMENT_SUCCESS` | Donation payment verified | `paymentFor: DONATION`, `contributionId`, `donationTitle`, … |
| `REFUND_REQUEST` | User creates refund order request | `requestId`, `orderId`, `orderNumber`, … |
| `REPLACEMENT_REQUEST` | User submits replacement | `requestId`, `orderId`, … |

## Example FCM payload (NEW_ORDER)

```json
{
  "notification": {
    "title": "New order",
    "body": "Order SATYA-ORD-10042 — ZAR 299.00 from Jane"
  },
  "data": {
    "type": "NEW_ORDER",
    "notificationId": "674a1b2c3d4e5f6789012345",
    "orderId": "674a1b2c3d4e5f6789012345",
    "orderNumber": "SATYA-ORD-10042",
    "userId": "674b...",
    "totalAmount": "299",
    "currency": "ZAR",
    "paystackReference": "T123"
  }
}
```

## Admin inbox APIs

| Method | Path |
|--------|------|
| `GET` | `/api/v1/admin/notifications` |
| `GET` | `/api/v1/admin/notifications/unread-count` |
| `GET` | `/api/v1/admin/notifications/:id` |
| `POST` | `/api/v1/admin/notifications/:id/read` |
| `POST` | `/api/v1/admin/notifications/read-all` |

### List response example

```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "674a...",
        "type": "NEW_ORDER",
        "title": "New order",
        "body": "Order SATYA-ORD-10042 — ZAR 299.00",
        "data": { "type": "NEW_ORDER", "orderId": "...", "orderNumber": "SATYA-ORD-10042" },
        "read": false,
        "createdAt": "2026-05-19T10:00:00.000Z"
      }
    ],
    "unreadCount": 1,
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
}
```

## Order flow note

Paystack orders are created with `paymentStatus: PENDING`. Admins are notified on **payment success** (`verifyPaymentByReference` / webhook), not on unpaid checkout. This matches fulfilment workflow.

## Files

| Path | Role |
|------|------|
| `src/config/firebase.js` | Firebase Admin init |
| `src/constants/adminNotificationTypes.js` | Type enum |
| `src/models/AdminNotification.js` | History |
| `src/models/AdminNotificationRead.js` | Per-admin read |
| `src/models/User.js` | `fcmTokens`, `fcmDevices` |
| `src/services/fcmTokenService.js` | Register / unregister tokens |
| `src/services/adminNotificationService.js` | Reusable notification service |
| `src/controllers/adminNotificationController.js` | Inbox HTTP handlers |
| `src/routes/adminNotificationRoutes.js` | Routes |
| `src/services/paymentService.js` | NEW_ORDER + PAYMENT_SUCCESS hooks |
