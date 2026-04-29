# NASA Moon Phases - Actual Implemented Flow

## 1) Data Source
- We fetch moon data from NASA SVS yearly dataset:
  - `https://svs.gsfc.nasa.gov/vis/a000000/a005500/a005587/mooninfo_<YEAR>.json`
- Implemented in: `src/services/nasaMoonService.js`
- Function: `getNasaMoonData(year)`

## 2) Moon Event Storage Model
- MongoDB model: `src/models/MoonEvent.js`
- Fields:
  - `type`: `"NEW_MOON"` or `"FULL_MOON"`
  - `eventTimeUtc`: `Date` (stored in UTC)
- Index:
  - `eventTimeUtc` indexed for month-range queries

## 3) Phase Detection Logic (Current)
- Implemented in: `src/utils/moonUtils.js`
- Function: `extractMoonEvents(data)`
- Logic:
  - Uses local min/max detection from neighboring points (not threshold approximation)
  - `NEW_MOON` when current phase is a local minimum
  - `FULL_MOON` when current phase is a local maximum
  - Handles flat plateaus and skips invalid rows
  - Returns:
    - `{ type, eventTimeUtc }[]`

## 4) Seeding / Persisting into MongoDB
- Script: `scripts/seedMoon.js`
- NPM command: `npm run seed:moon`
- Flow:
  1. Connect MongoDB via `MONGO_URI`
  2. Loop years: `2025` to `2030`
  3. Fetch NASA data (`getNasaMoonData`)
  4. Extract moon events (`extractMoonEvents`)
  5. Upsert into `MoonEvent` collection using `bulkWrite`
     - Filter: `{ type, eventTimeUtc }`
     - `upsert: true` to avoid duplicates
  6. Print extraction preview logs for verification

## 5) Calendar API Integration
- Controller: `src/controllers/calendarController.js`
- Existing festivals + poojas logic is kept intact
- Added moon phases via:
  - `getMoonPhasesForMonth(year, month, timezone)`
- Service: `src/services/moonService.js`
  - Validates timezone
  - Converts requested month boundaries from user timezone to UTC
  - Queries `MoonEvent` in that UTC range
  - Converts `eventTimeUtc` back to user timezone
  - Formats date as `YYYY-MM-DD`

## 6) API Output
- Endpoint: `GET /api/v1/calendar?month=<M>&year=<Y>`
- Header required from frontend:
  - `x-timezone: <IANA timezone>` (example: `America/Los_Angeles`)
- Response now includes:
  - `moonPhases: [{ type, date }]`

## 7) Verification Utility
- Script: `scripts/testMoonApril2026.js`
- NPM command: `npm run test:moon-april-2026`
- Purpose:
  - Fetch NASA 2026 data
  - Run extraction logic
  - Print April events for quick validation

## 8) Important Rules Followed
- UTC is stored in DB (`eventTimeUtc`)
- Timezone conversion happens at service/API layer
- NASA API is used only during seed/import, not during calendar request runtime
