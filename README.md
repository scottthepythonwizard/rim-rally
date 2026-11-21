# Rim & Rally frontend

Next.js 16 / React frontend for court bookings, open play, manual payment proof,
digital passes and staff management. The Django backend is maintained separately.

## Install and run

Use Node.js 24 and npm. Run `npm ci`, copy `.env.example` to `.env.local`, and run
`npm run dev`. Never commit real environment credentials or customer records.

`npm run build` builds production output; `npm start` serves it.
On Windows, `npm run build -- --webpack` is an available alternative to Turbopack.

## Backend connection

See [backend connection](docs/BACKEND-CONNECTION.md). Django is not bundled here.
The frontend can install and build without Python, a database, or a running backend.
Backend-dependent actions need the separately hosted service to work at runtime.
Set `NEXT_PUBLIC_BACKEND_ENABLED=0` and rebuild to show the paused screens, or use
`NEXT_PUBLIC_API_MODE=mock` for an explicit demonstration without real payments.

## Checks and organization

Run `npm test` and `npm run lint`. The retained unit/component/service tests cover
booking validation, payment states, API errors, rendering, and safely paused access.
Backend-dependent browser fixtures and retired Node database tests are excluded.

See [frontend structure](docs/FRONTEND-STRUCTURE.md) for where new code belongs.
Older milestone documents are historical references, not current backend setup.
