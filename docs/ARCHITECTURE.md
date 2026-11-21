# Presentation tier boundaries

## Implemented now

Routes call `src/services/facilities/facility-service.js`, which returns cloned fixture data. Components do not import fixtures or query a database. Static route content remains in Server Components. Native dialogs provide focus trapping and Escape dismissal inside a small client boundary. See FRONTEND-STRUCTURE.md for the current source organization.

## API contracts and future work

The local integration uses `staff_api/api.py` in the existing Django host to adapt these contracts to canonical payment models/services. Next.js proxies guest requests and uses protected server actions for staff. Court allocation is locked in Django, with a shared hold guard for native REST reservations. Discovery descriptions/assets still use fixtures; live courts, prices, sessions and availability come from Django. See PAYMENT-INTEGRATION.md for current setup and recovery; earlier Node SQLite implementation notes are historical.

- GET /facilities?sport=: facility list.
- GET /facilities/:id: facility, image assets, amenities, courts, hours.
- GET /availability?facilityId=&sport=&date=: serverNow, courtId, slot IDs, start/end timestamps, status, pricing band, integer-centavo amounts.
- GET /open-play?facilityId=&sport=&date=: sessions, registered count, capacity, price.
- POST /holds: slot IDs or one session ID; returns ID, expiry, server time, acknowledged selection, itemized quote; X-Guest-Recovery carries the client-generated credential under the proposed contract.
- PATCH /holds/:id: atomic replacement without extending expiry.
- GET /holds/:id and DELETE /holds/:id: revalidate / release.
- POST /payment-attempts: hold, guest, method, applicable inputs, idempotency key.
- GET /payment-attempts/:id: pending/succeeded/failed/cancelled, confirmed booking ID when ready.
- GET /payment-attempts/by-key/:idempotencyKey: reconcile an attempt when its creation acknowledgement was lost.
- GET /bookings/:id: confirmed receipt and opaque ticket token.

IDs alone do not authorize guest access. `X-Guest-Recovery` carries the browser-generated recovery credential, stored only as a hash on the server. No secrets belong in NEXT_PUBLIC variables.

- POST /payment-attempts/:id/proof: multipart fields `proof` and `reference`; private PNG/JPEG up to 5 MB, decoded and re-encoded by the server.
- POST /bookings/:id/cancellations: JSON `reason`, required, at most 1,000 characters; staff process the request.
- Staff pages and server actions require a valid staff session. GET /dashboard/proofs/:id also checks the session and disables caching.

Normalize failures to code, message, fieldErrors, retryable, optional requestId. Validate successful data too. Timeout after 15 seconds; abort obsolete reads; suppress stale responses. Poll visible availability every 30 seconds and pending payment every three seconds. After two minutes, show delayed-status recovery rather than creating a new payment.

## State plan

- URL: sport, mode, date, court.
- Reducer: selection, acknowledged hold, quote, expiry, step, submission and error states.
- Form state: contact and payment inputs, never persisted in browser storage.
- Session storage: opaque recovery handle and non-sensitive selection metadata only.
- Backend: authoritative locks, pricing, capacity, payment reconciliation, ticket validity.

Use ISO timestamps with explicit offsets; display Asia/Manila dates. Calculate totals in centavos. One court/date and contiguous hours, or one Open Play place. Own hold edits preserve expiry. Rejected changes preserve the last acknowledged selection.
