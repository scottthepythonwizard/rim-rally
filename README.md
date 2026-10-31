# Rim & Rally

Presentation-tier prototype built with Next.js App Router, Tailwind CSS, and JavaScript. No backend, database, or payment processing is implemented.

## Run locally

Prerequisite: Node.js 20.9 or newer (developed with Node 24).

1. Run `npm ci`.
2. Run `npm run dev`.
3. Open http://127.0.0.1:3000.
4. Select Book a court in the hero, or open `/book/rim-and-rally`.

Other commands: `npm run lint`, `npm run build`, and `npm start` (after a build).

## Current milestone: Phase 3 holds and guest details

- Prototype-based landing page with the user's corrected copy and navigation.
- Supplied theme colors, local 42dot Sans / Noto Serif, neutral image placeholders.
- Hybrid calendar: React DayPicker plus our own court/hour matrix and service-backed availability.
- Previous/next day, Today/Tomorrow, sport, court, and Court/Open Play controls.
- Asia/Manila dates; 16 hourly slots from 8 AM through next-day midnight.
- Available, selected, held, booked and elapsed states with readable labels.
- Consecutive hours on one court, mixed peak/off-peak pricing, integer-centavo totals.
- Open Play occupancy, remaining places, one-place selection, full/started session disabling.
- Desktop matrix, mobile single-court list, sticky mobile selection total.
- Loading, retry, no-schedule, sold-out, slow and malformed-response previews.
- Abortable reads, 15-second HTTP timeout, validation, refresh/reconciliation.

**Not yet implemented:** checkout, payments, confirmed bookings, receipts and QR tickets. The hold is temporary and is not a confirmed reservation.

## Tests

- `npm test`: Vitest scheduling, service, and component tests.
- `npm run test:watch`: interactive unit test mode.
- `npx playwright install chromium`: install the browser once before browser tests.
- `npm run test:e2e`: browser acceptance tests; reuses the local server on port 3000, or starts it if needed.
- To reuse a running local server, set `PLAYWRIGHT_BASE_URL` to its URL before running `npm run test:e2e`. Avoid starting multiple development servers for the same project.

The UI offers collapsed “Demo availability scenarios” controls. Scenarios can also be shared through `scenario=normal|sold-out|empty|error|slow|malformed` in the booking URL.

See [roadmap](docs/ROADMAP.md) for progress and next tasks, [API contract](docs/API-CONTRACT.md) for backend handoff, [architecture](docs/ARCHITECTURE.md) for frontend boundaries, and [assets](docs/ASSETS.md) for image policy.

## Architecture

`src/app/` contains Server Component route shells. `src/features/booking/` contains the small client booking boundary, presentational views, date helpers, and selection reducer. `src/services/` owns HTTP/mock adapters and validation. `src/mocks/` contains illustrative inventory and pricing. Components never query a database.

Copy `.env.example` to `.env.local` if configuring a live service. `NEXT_PUBLIC_API_MODE=http` enables scheduling and hold HTTP adapters; the default is mock. `NEXT_PUBLIC_API_BASE_URL` supplies the API base URL. Facility discovery remains mock-backed. Restart Next.js after environment changes. See the API contract for CORS and response requirements.

## Design and scope

Preserve the supplied prototype and corrected content. All court/facility image areas use neutral local SVG placeholders; add actual images only at the user's direction. Square frames remain 1:1. The logo is still an approximation until original artwork is supplied. The user confirmed one basketball half-court and flat PHP 400/hour court rates for both sports. Availability, Open Play rates/capacities, peak windows and the three-court pickleball fixture remain demo data pending backend confirmation.
### Phase 3 behavior

- Selecting an available hour or Open Play place requests a service-acknowledged ten-minute hold.
- Consecutive-hour edits replace the same hold atomically without extending expiry.
- Another court/date/sport/mode releases the previous hold before acquiring a new one.
- Countdown uses service expiry plus monotonic elapsed time, remains visible while scrolling, and revalidates after focus/reconnection and before proceeding.
- Lost acknowledgements retain the same idempotency key; retry reconciles the original request instead of creating another hold.
- Browser reload recovers the hold using an opaque session recovery record. Name, email and mobile stay only in React memory and are not restored after reload.
- Guest form validates name, email and Philippine mobile formats; review shows the acknowledged quote and normalized phone number.
- Same-origin tab competition is simulated using Web Locks and non-personal localStorage records. Real cross-user locking requires the backend.
- Cancellation and expiry release or invalidate the held resources. Demo hold controls can expire a hold immediately for testing.

Backend agreement and live integration details: [hold API contract](docs/HOLD-API-CONTRACT.md). The existing scheduling API contract remains applicable, with ownership fields described in the hold contract.

Verified: 37 unit/component tests, 14 browser acceptance tests, lint and production build. Browser tests cover late/uncertain acknowledgements, cross-tab conflicts, Open Play capacity, expiry, reload recovery, private-data storage checks, and guest-form responsiveness at 360/390/768/1024/1440px.