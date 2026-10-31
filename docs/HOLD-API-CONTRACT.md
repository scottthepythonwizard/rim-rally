# Temporary holds and guest details — Phase 3 handoff

## Presentation-tier scope

Phase 3 implements selection → acknowledged hold → guest details → review. It does not implement checkout, payment, a confirmed booking, or tickets. The mock simulation runs entirely in the browser, not a Next.js business endpoint or database.

Court pricing remains PHP 400 per hour for both sports. Inventory remains one basketball half-court and the three-court pickleball fixture. Landing-page styling, approved copy and image placeholders are preserved.

## Hold response

Return `id`, `context`, `revision`, `expiresAt`, `serverNow`, `slots`, `session`, and `quote`.

- `context`: facilityId, sport, date (Asia/Manila YYYY-MM-DD), mode (court/open-play).
- `revision`: positive integer incremented after accepted edits.
- `expiresAt` and `serverNow`: ISO timestamps with explicit offsets. A new hold lasts ten minutes; edits do not extend it.
- `slots`: acknowledged private-booking slots, ordered, contiguous, one court/date, one hour each. Empty for Open Play. Each has id, courtId, startAt, endAt, priceBand.
- `session`: null for private booking, otherwise the one acknowledged Open Play session with id, name, courtName, startAt, endAt, registeredCount, capacity, priceBand.
- `quote`: currency PHP; items array of unique resource IDs and integer-centavo amounts; totalAmount equals their sum. Amounts shown in the summary come from the acknowledgement, not cached selection data.

The frontend validates shapes, quote arithmetic, timestamps and context, and rejects an unexpected deadline extension for an already acknowledged hold. Backend remains authoritative for resource allocation, price policy, credentials and all business validation.

## Proposed HTTP operations

`NEXT_PUBLIC_API_MODE=http` enables these service calls using the existing API base URL. This contract must be agreed with the backend team before live integration.

- POST /holds: body contains facilityId, sport, date, mode, and either slotIds or sessionId. Include an Idempotency-Key and X-Guest-Recovery header.
- GET /holds/:id: require X-Guest-Recovery. Return current acknowledged selection, quote, deadline and revision, or a terminal error for expired/released holds.
- PATCH /holds/:id: private-booking body contains slotIds and the expected revision. Apply the entire replacement atomically, checking all selected resources. Preserve original expiry. Use a fresh Idempotency-Key for a distinct edit; replay the same key after uncertainty.
- DELETE /holds/:id: require the recovery credential, release all resources, and return released=true (or HTTP 204). Repeating release is safe.

Recovery credential proposal: the service generates a cryptographically random opaque credential before creation and sends it in X-Guest-Recovery. The mock stores only its digest. The backend must validate/hash this credential or agree on an alternative server-issued recovery flow before deployment. Do not treat hold IDs as authorization. Require HTTPS and configure CORS for the content-type, idempotency and recovery headers. Never log the recovery header.

Backend errors should use `error.code` with a safe message, fieldErrors and optional requestId. Supported terminal codes: HOLD_EXPIRED, NOT_FOUND (HTTP 410/404 also terminate recovery). CONFLICT rejects an acquisition or edit, preserving the previous acknowledged hold. REVISION_CONFLICT requires refetching the latest hold. Invalid or delayed responses block progression until verified.

The HTTP client times out after 15 seconds. A timeout does not prove that a write failed. The client persists the original non-sensitive request metadata and idempotency key, then retries that same operation or revalidates the hold. Never silently start a second hold after an uncertain response. The backend must bind idempotency keys to the same guest and operation and retain replay information long enough to reconcile expiry.

## Availability coordination

GET /availability and GET /open-play may accept X-Guest-Recovery so responses can identify this guest's own hold. Private slots expose `status=held` and `heldByYou=true` for ownership. Another user's hold is disabled. Open Play adds `heldCount` and `heldByYou`: remaining places = capacity − registeredCount − heldCount. Registered players do not increase until actual booking confirmation in a later phase.

Changing sport/date/mode or court releases the old hold before a new selection can be secured. Updating hours on the same court uses PATCH. A rejected update preserves the last acknowledgement and expiry. Leaving the booking page without cancellation leaves the temporary hold to expire; returning can recover it. Unacknowledged late success after a context change is released instead of shown in the wrong schedule.

## Timer and recovery

The countdown uses serverNow/expiresAt plus monotonic elapsed time, not decrementing interval counts. Intervals repaint once per second; announcements occur only at meaningful thresholds. Visibility/focus/reconnection and 30-second checks revalidate service state. Guest-details/review progression performs another hold check. Expiry returns to selection and disables progression; it does not auto-renew.

sessionStorage contains only an opaque recovery credential, hold/context metadata and pending idempotent operation. No guest name, email or mobile number is persisted. Guest details are React memory only, survive moving between steps, and clear on reload or cancellation. Reload recovery restores the hold, not the contact form.

## Mock simulation limits

The browser mock uses localStorage for non-personal hold records and a credential digest, with Web Locks serializing mutations across same-origin tabs. It needs localhost or HTTPS and a browser supporting Web Locks. Storage/lock failures block acquiring a hold. It simulates private-slot competition and final-place Open Play capacity but is not secure against local storage manipulation or other devices/users. The mock authority shares the browser's wall clock; only a dedicated backend provides an independent authoritative clock.

The existing availability scenarios remain available. “Demo hold controls” offers “Expire demo hold” for testing without waiting ten minutes. That control is absent in HTTP mode. Tests inject lost acknowledgements after mock commits to prove idempotent recovery without duplicate resources.

## WHAT COULD I BE WRONG ABOUT?

- Suspended tabs and device sleep may defer repainting. Remaining time derives from elapsed timestamps and is checked again on return; backend expiry is final. Network response transit can make the display slightly approximate, so it never substitutes for service validation.
- Unexpected backend error codes, malformed success payloads or slow writes can leave the result uncertain. The UI blocks progression, preserves form input and replays the original request or refetches the hold rather than declaring success.
- These hold endpoints, credential transport, revision semantics, ownership fields and idempotency retention need backend agreement and integration tests. Real multi-user locking and payment reconciliation are outside this browser-only simulation.
