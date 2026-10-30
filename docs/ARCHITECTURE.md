# Presentation tier boundaries

## Implemented now

Routes call `src/services/facility-service.js`, which returns cloned fixture data. Components do not import fixtures or query a database. Static route content remains in Server Components. Native dialogs provide focus trapping and Escape dismissal inside a small client boundary.

## API contracts and future work

Phase 2 implements REST availability and Open Play reads through one HTTP client with a mock/HTTP adapter switch. Discovery remains mock-backed. The remaining hold/payment endpoints below are future contracts; see API-CONTRACT.md for implemented scheduling details. JavaScript JSDoc defines service payloads. Server Components consume read services; the booking controller consumes interactive services. Do not add business API routes to Next.js.

- GET /facilities?sport=: facility list.
- GET /facilities/:id: facility, image assets, amenities, courts, hours.
- GET /availability?facilityId=&sport=&date=: serverNow, courtId, slot IDs, start/end timestamps, status, pricing band, integer-centavo amounts.
- GET /open-play?facilityId=&sport=&date=: sessions, registered count, capacity, price.
- POST /holds: slot IDs or one session ID; returns ID, expiry, server time, acknowledged selection, itemized quote, opaque recovery credential.
- PATCH /holds/:id: atomic replacement without extending expiry.
- GET /holds/:id and DELETE /holds/:id: revalidate / release.
- POST /payment-attempts: hold, guest, method, applicable inputs, idempotency key.
- GET /payment-attempts/:id: pending/succeeded/failed/cancelled, confirmed booking ID when ready.
- GET /bookings/:id: confirmed receipt and opaque ticket token.

IDs alone do not authorize guest access. The API must define credential transport before live integration. No secrets belong in NEXT_PUBLIC variables.

Normalize failures to code, message, fieldErrors, retryable, optional requestId. Validate successful data too. Timeout after 15 seconds; abort obsolete reads; suppress stale responses. Poll visible availability every 30 seconds and pending payment every three seconds. After two minutes, show delayed-status recovery rather than creating a new payment.

## State plan

- URL: sport, mode, date, court.
- Reducer: selection, acknowledged hold, quote, expiry, step, submission and error states.
- Form state: contact and payment inputs, never persisted in browser storage.
- Session storage: opaque recovery handle and non-sensitive selection metadata only.
- Backend: authoritative locks, pricing, capacity, payment reconciliation, ticket validity.

Use ISO timestamps with explicit offsets; display Asia/Manila dates. Calculate totals in centavos. One court/date and contiguous hours, or one Open Play place. Own hold edits preserve expiry. Rejected changes preserve the last acknowledged selection.
