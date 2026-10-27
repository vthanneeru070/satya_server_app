# Migration: Website donation source (Option A)

## Change summary

- `DonationContribution.user` becomes **optional** (`required: false`, default `null`).
- New fields on `DonationContribution`:
  - `source`: `"APP"` | `"WEBSITE"` (default `"APP"`)
  - `donorEmail` / `donorName` (optional, website donors only)
- `Payment.user` becomes **optional** for anonymous website donations.

## Production impact

- **No destructive migration.** Existing documents already have `user` set; they remain valid.
- Mongoose will treat missing `source` as `"APP"` via schema default on **new** reads/writes when the field is absent only for new creates — existing docs without `source` will not auto-rewrite until touched. Admin/list code should treat missing `source` as `APP`.
- Indexes added: `{ source: 1, createdAt: -1 }`. MongoDB creates them on next app start (Mongoose `autoIndex` / syncIndexes behavior of your deploy).

## Optional backfill (non-blocking)

```js
// scripts/backfillDonationSourceApp.js — run only after approval
db.donationcontributions.updateMany(
  { source: { $exists: false } },
  { $set: { source: "APP" } }
);
```

## Deploy order

1. Deploy backend with new schema + public website donate endpoint.
2. Optionally run backfill (not required for correctness).
3. Deploy landing `/donate` page.
4. Deploy mobile app that opens external donate URL.

**Do not run this against production until explicitly approved.**
