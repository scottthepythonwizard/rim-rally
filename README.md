# Rim & Rally

Presentation-tier prototype built with Next.js App Router, Tailwind CSS, and JavaScript. No backend, database, or payment processing is implemented.

## Run locally

Prerequisite: Node.js 20.9 or newer (developed with Node 24).

1. Run `npm ci`.
2. Run `npm run dev`.
3. Open http://127.0.0.1:3000.
4. Select Book a court in the hero, or open `/book/rim-and-rally`.

Other commands: `npm run lint`, `npm run build`, and `npm start` (after a build).

## Current milestone: Phase 2 discovery and scheduling

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

**Not yet implemented:** ten-minute holds, guest contact form, checkout, receipts, QR tickets. A selection is not reserved; no mutation API is called.

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

Copy `.env.example` to `.env.local` if configuring a live service. `NEXT_PUBLIC_API_MODE=http` enables the availability/Open Play HTTP adapter; the default is mock. `NEXT_PUBLIC_API_BASE_URL` supplies the API base URL. Facility discovery remains mock-backed. Restart Next.js after environment changes. See the API contract for CORS and response requirements.

## Design and scope

Preserve the supplied prototype and corrected content. All court/facility image areas use neutral local SVG placeholders; add actual images only at the user's direction. Square frames remain 1:1. The logo is still an approximation until original artwork is supplied. Court counts, rates, capacities and peak windows are explicitly demo data pending backend confirmation.