# Rim & Rally

Presentation-tier prototype built with Next.js App Router, Tailwind CSS, and JavaScript. No backend, database, or payment processing is implemented.

## Run locally

Prerequisite: Node.js 20.9 or newer (developed with Node 24).

1. Run `npm ci`.
2. Run `npm run dev`.
3. Open http://127.0.0.1:3000.

Other commands: `npm run lint`, `npm run build`, and `npm start` (after a build).

## Current milestone: Phase 1 foundation

- Prototype-based six-section home page.
- Supplied theme colors and locally hosted 42dot Sans / Noto Serif.
- Responsive header, native mobile menu, accessible notices, shared primitives.
- Facility service and read-only mock fixtures.
- Facility preview and booking entry with sport and booking-type navigation.
- Loading, error, and missing-page screens.

**Not yet implemented:** hourly availability, holds, contact form, checkout, receipts, or QR tickets. The booking entry explicitly identifies its current milestone.

See [the roadmap](docs/ROADMAP.md) for the dated milestones and next task. See [architecture](docs/ARCHITECTURE.md) for frontend boundaries and [assets](docs/ASSETS.md) for temporary content.

## Architecture

`src/app/` contains Server Component routes and the sole global stylesheet. `src/components/` contains reusable presentation components. `src/services/` owns data access. `src/mocks/` contains illustrative fixtures. Small interactive notices are client components; entire pages do not need client rendering.

`NEXT_PUBLIC_API_MODE` and `NEXT_PUBLIC_API_BASE_URL` in `.env.example` reserve configuration names for the upcoming HTTP adapter. They do not switch the current read-only mock facility service to a live backend.

## Design reference

Preserve the supplied screenshot's navigation → tan hero → light-gray courts → dark membership → tan location → dark footer sequence. Court photographs use square 1:1 frames; the responsive page itself scrolls naturally. Original logo and photography have not been supplied, so these assets remain approximations. No actual booking or payment is advertised as completed.
