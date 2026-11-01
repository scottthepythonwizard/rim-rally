# Phase 4 checkout and digital passes

Implemented November 1, 2026 (Asia/Manila), in the existing Desktop/my-app frontend. This supersedes the disabled preview described in PHASE-4-FOUNDATION.md.

## Presentation boundaries

The guest flow now supports GCash, Maya and QRPh demonstration checkout, failed payment retry/cancel, pending and unknown reconciliation, confirmed receipts, per-booking QR tickets and browser Print / Save as PDF. Original landing styling, placeholder images, one basketball half-court and PHP 400/hour court pricing remain intact.

No backend endpoint, database schema, authentication engine or real payment processor is implemented. The browser mock is a local demonstration, not production payment or concurrency protection. QRPh demonstrations encode an unmistakable demo payload; they cannot transfer money. Production QRPh stays disabled until a provider-issued payable QR and backend contract are implemented. Membership/login/newsletter remain explanatory notices.

## File responsibilities

- src/features/checkout/payment-methods.jsx: accessible native payment dialog, explicit keyboard wrapping/restoration, wallet/reference fields and clearly labeled demo scenarios.
- src/features/checkout/payment-status.jsx: submission, recovery, visible polling and confirmation gating.
- src/services/payment-operations.js: transport selection, response validation and booking ownership/amount matching. Components never fetch the database or implement pricing rules.
- src/mocks/payment-engine.js: injected mock operations sharing the hold engine's Web Lock/store, so allocation and simulated settlement are coordinated atomically across tabs.
- src/features/checkout/confirmation.jsx: receipt/pass, local QR component and print action.
- src/app/booking/[bookingId]/confirmation/: server route shell with loading/error boundaries; guest credential access happens only in the client service.

## Proposed REST agreement

These are frontend expectations for backend review, not instructions to add Next.js API routes.

### POST /payment-attempts

Headers: X-Guest-Recovery, Idempotency-Key, Content-Type application/json.

Body: holdId, holdRevision, expectedAmount, method=gcash|maya|qrph, guest={name,email,mobile}, and either normalized wallet mobile (+639…) or reference. The mock additionally accepts scenario, which is never sent in HTTP mode.

The client freshly revalidates its hold before creating the operation. expectedAmount is an optimistic quote check, never a price override. Backend must validate the hold/revision, use its authoritative quote, reject stale selections before initiating money movement, validate guest fields and retain idempotency results across retries/expiry. A submitted reference is not payment verification. Wallet input needs the provider's real approval flow before production use.

Response: id, holdId, method, currency=PHP, positive integer-centavo amount, status, bookingStatus, optional bookingId, serverNow (ISO timestamp with explicit timezone).

- status: pending | succeeded | failed | cancelled | unknown.
- bookingStatus: none | pending | confirmed.
- Only succeeded + confirmed + bookingId permits navigation to a pass, followed by another validated GET booking.
- succeeded + pending stays in reconciliation without a pass.
- failed/cancelled cannot carry a confirmed booking.

### GET /payment-attempts/:id

Require the guest recovery credential. Return the same validated shape. Match holdId, method, amount and attempt ID to the original operation. Do not expose provider raw errors to guests.

### GET /payment-attempts/by-key/:idempotencyKey

Additional required recovery contract when POST acknowledgement is lost before the client receives an attempt ID. Require the same guest credential and resolve the original operation, without creating another charge. A backend may instead provide an equivalent agreed lookup/replay mechanism.

Missing/unknown records must have explicit semantics: a timeout or ordinary 404 alone must not encourage another payment while a write can still commit. The UI keeps uncertain outcomes on the same status screen; it never silently submits a fresh payment. With no resolvable backend outcome, facility/provider support is required using the identifier shown.

### GET /bookings/:id

Require the recovery credential; IDs alone are not authorization. Return id, holdId, status=confirmed, reference, guestName, facilityName, context={facilityId,sport,date,mode}, slots or session, amount, currency=PHP, method and ticketToken. Slots have courtId/startAt/endAt; sessions have name/courtName/startAt/endAt. Amount/hold/method must match the original payment. The opaque token must contain no guest PII and requires backend check-in verification to be valid in production.

### Cancellation policy

Mock cancellation is offered only after a definitive failed payment. It releases the hold only if no newer pending or confirmed payment owns it. Retrying failure creates a new operation key after revalidating the original hold; expiry requires a new selection.

There is intentionally no invented production cancellation endpoint. The HTTP cancellation action explains that facility assistance is required until provider cancellation/refund rules are agreed. Releasing a hold never cancels a pending charge. Pending/unknown payments retain backend allocation responsibility beyond the ten-minute display deadline.

## Recovery and privacy

sessionStorage key rim-rally:payment-recovery:v1 stores only opaque credential, idempotency key, optional attempt ID, hold ID, method, expected amount and start timestamp. Contact/payment inputs are memory-only. A rejected or failed payment retains guest fields while returning to the reservation in the same mounted page. Reload clears those fields. No localStorage/sessionStorage entry contains guest name, email, mobile or submitted reference.

The mock persists only non-personal allocation/payment records, credential hashes and opaque ticket tokens under the existing hold store. Mock guest names are kept in a service memory map for the initial pass. After a full reload, the recovered demo pass explicitly says the guest details were cleared; the live backend must supply guestName. Save/print the initial pass for a named demo receipt. Starting another booking replaces the latest payment recovery record, so guest booking history/account recovery remains outside scope.

Visible pending payments poll every three seconds; focus, visibility return and reconnection trigger checks. After two minutes the UI shows a delayed-status message and manual check action while continuing reconciliation. Neither elapsed hold time nor elapsed polling time implies payment failure. The normal hold interval is unmounted during payment; the mock and production backend own allocation reconciliation.

Request timeout remains 15 seconds in the shared API client. Failed/malformed success responses become useful errors and do not issue a pass. Malformed/unexpected submission errors remain uncertain until the original operation can be checked. No raw response or stack trace is shown.

## Demo scenarios and verification

In the payment dialog choose Success, Failed, Uncertain then recovered, Paid allocation pending, Delayed over two minutes, Malformed result then recovered, or Rejected fields. Scenarios never imply a real transfer. In mock mode, use localhost/HTTPS with Web Locks and browser storage enabled.

Run npm test, npm run test:e2e, npm run lint and npm run build. Playwright covers all methods, both sports, Open Play, failure retry/cancellation, wallet validation, focus trapping/restoration, pending allocation, delayed status, unknown reload across expiry, malformed results, lost acknowledgements, repeated clicks, personal-data storage checks, print media and responsive pass overflow. Existing schedule/hold tests remain in the suite.

Next milestone: final accessibility/visual review, backend contract agreement and integration only if ready, original assets when the user supplies them, and final demo/handoff checks. No live payment acceptance or deployment is implied by completion of this frontend milestone.

## WHAT COULD I BE WRONG ABOUT?

- Background tabs suspend timers and device clocks change. Hold validity uses revalidation plus monotonic elapsed time; payment reconciliation uses service status on return. The two-minute delayed-message threshold is approximate across reload/device-clock changes and never authorizes a charge or confirms a booking. The mock shares the browser clock; independent production timing requires the backend.
- Unexpected errors, delayed writes and mismatched payloads can make a result uncertain. The UI preserves the opaque operation, blocks another payment, validates the result and checks the original operation. The by-key lookup, expiry handoff, successful-allocation timing and cancellation rules require backend/provider agreement and real integration testing.
- Browser mocks cannot prove production cross-user allocation, provider success or ticket validity. Mobile print/PDF behavior also varies by browser; verify target devices during final handoff.
