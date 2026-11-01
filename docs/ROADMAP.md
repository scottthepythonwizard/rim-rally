# Roadmap to November 30, 2026

All dates use Asia/Manila. Target completion is November 29, before the November 30 deadline. Capacity: one frontend developer, 10–15 hours per week, approximately 52 hours total. Milestones may finish early; later dates are checkpoints, not reasons to delay ready work.

## Today's goal — October 30: start Phase 1

Establish a runnable Next.js + Tailwind foundation that follows the prototype. Build theme tokens, responsive navigation and hero, then the six-section landing baseline. Add working entry links so later booking features have a home.

Acceptance:
- [x] Next.js App Router, Tailwind CSS, JavaScript configuration.
- [x] Shared colors, local fonts, reusable buttons and brand treatment.
- [x] Prototype-ordered landing sections and square court-photo frames.
- [x] Desktop navigation, mobile menu, informational dialogs.
- [x] Booking entry with URL sport/mode selection; no pretend reservations.
- [x] Read-only facility mock service; no database access.
- [x] Loading, error, and not-found UI.
- [x] Production build, lint, and browser smoke verification recorded below.

## October 30–November 1: foundation / 6 hours

Finish visual comparison against the reference and basic responsive QA. Keep header, hero, paired court cards, membership panel, location image, and footer recognizable. Obtain original logo and court photographs when available.

Exit: all six sections render, primary links reach the booking entry, and there is no page overflow at the agreed widths.

## November 2–8: discovery and scheduling / 12 hours

1. Add date/court controls and URL synchronization.
2. Create scheduling helpers: Asia/Manila date handling, 16 hourly intervals from 08:00 through next-day 00:00, elapsed-time disabling.
3. Define availability and Open Play mock contracts behind services.
4. Render desktop matrix and mobile single-court hourly list.
5. Implement contiguous one-court selection, four labeled slot states, and integer-centavo totals.
6. Show Open Play occupancy and one-place reservation selection.
7. Add loading, empty, sold-out, and retry states.

Exit: select consecutive hours or one available Open Play session for either sport. No client-authored pricing rules.

## November 9–15: holds and guest details / 12 hours

1. Introduce booking reducer and request cancellation / stale-response guards.
2. Request acknowledged ten-minute holds immediately on selection.
3. Update selections atomically without resetting expiry.
4. Add expiry, release, recovery, and tab/focus revalidation.
5. Create contact and review steps; preserve data after expected errors.
6. Simulate competing reservations across tabs.

Exit: checkout requires a verified hold; conflicts preserve acknowledged selection. No claim of real cross-user locking.

## November 16–22: simulated checkout and pass / 12 hours

1. Add GCash, Maya, QRPh selection and accessible payment dialogs.
2. Validate mobile formats, display demonstration payment QR, and accept reference input without treating it as proof of payment.
3. Add idempotent submission, pending polling, failure/retry/cancel, and uncertain-status reconciliation.
4. Confirm only after service status says confirmed.
5. Add receipt, per-booking QR ticket token, and print / save as PDF.

Exit: every flowchart branch is represented, including retry and cancellation.

## November 23–26: verification and handoff / 6 hours

- Vitest + React Testing Library: scheduling, reducer, countdown, totals, normalized errors.
- Playwright: both sports, Open Play, all payment methods, expiry, conflict, refresh, late responses, repeated submission, print output.
- Keyboard and dialog focus checks; screen-reader labels and meaningful timer announcements.
- Visual and overflow checks at 360, 390, 768, 1024, 1440px.
- Final API contract, environment example, mock scenarios, assets and limitations.
- Live API smoke test only if available without delaying delivery.

## November 27–29: protected buffer / 4 hours

Fix remaining defects, verify production build, rehearse demo, finish setup documentation, and freeze scope.

Reduce animation and gallery enhancements first if time runs short. Preserve booking state correctness, prototype structure, all payment options, recovery, and digital pass.

## Session routine

1. Read current status and choose the next unchecked task.
2. Implement one reviewable unit.
3. Verify its acceptance condition.
4. Record evidence and the next task here.

## Current status

Phases 1–4 are implemented with browser mocks. The guest journey includes acknowledged holds, guest details, simulated payments and confirmed demo passes. Production payments and allocation require backend/provider integration.

Next session: final responsive/accessibility review, backend contract agreement, asset handoff and demo rehearsal. Preserve the guest-only scope.

### Verification evidence — October 30

- `npm run build`: passes, Next.js 16.4.3 production build.
- `npm run lint`: passes with no errors or warnings.
- Home and facility pages: no horizontal overflow at 360, 390, 768, 1024, 1440px.
- Local fonts and all images loaded; both court card photographs measure 1:1.
- Login notice: opens, focuses its close action, dismisses with Escape, and restores focus.
- Mobile menu: opens and closes after following a navigation link (fixed during verification).
- Booking entry: selecting Basketball then Open Play preserves both choices in the URL and active controls.
- Unknown facility: displays the custom not-found page.
- Browser logs: no warnings/errors observed during the smoke pass.
- Screenshot: [desktop landing page](screenshots/phase-1-desktop.jpg).

The restricted Windows sandbox prevented Turbopack's child-process connection. The production build passed outside that isolation; no application workaround was needed. Browser checks were performed against the production server.

Automated Vitest/Playwright suites remain scheduled with the booking behavior they will verify. These browser checks are manual tool-driven smoke checks, not a claim that those suites exist.

## WHAT COULD I BE WRONG ABOUT?

- Timers pause in background tabs: derive remaining time from server expiry plus monotonic elapsed time, then revalidate on return. Intervals are only display refreshes.
- Backend errors and delays may violate assumptions: validate payloads, normalize error bodies, preserve input, cancel stale reads, and reconcile uncertain writes before retry.
- Exact photography, logo geometry, address, and amenities cannot be proven from the supplied screenshot. These remain tracked asset/content dependencies.
- Scope assumes guest-only, mock-complete delivery. Real payments, membership operations, accounts, and staff screens require separate work.

## Phase 2 implementation — October 31

Completed the scheduling milestone ahead of its November 2–8 checkpoint. Added the styled calendar, desktop matrix and mobile list, all 16 hourly intervals, sport/date/court/mode URL state, consecutive-hour selection, peak/off-peak totals, Open Play capacity and one-place selection. Existing landing corrections and image placeholders were preserved.

Services implement mock/HTTP adapters, response validation, 15-second timeout, request cancellation, stale-response protection and visible availability refresh. Error, sold-out, empty, slow and malformed-response scenarios are selectable in the preview.

Backend handoff: docs/API-CONTRACT.md. API inventory/rates/capacities remain illustrative until approved. No holds, contact data, payments or booking mutations are implemented in Phase 2.

Verification: 22 unit/component tests and 5 browser acceptance tests pass; production build and lint pass. Browser checks found no horizontal overflow at 360, 390, 768, 1024 or 1440px. Calendar close restores focus. Desktop court columns/mobile single-court layout, date history, stale-request handling and recoverable scenarios were checked.
Screenshots: [desktop](screenshots/phase-2-desktop.jpg), [mobile](screenshots/phase-2-mobile.jpg), [calendar](screenshots/phase-2-calendar.jpg).

## Phase 3 implementation — October 31

Completed acknowledged ten-minute holds for private court hours and one-place Open Play selections. Added atomic same-court edits preserving expiry, held-for-you states, sticky countdown, cancellation, changed-context release, reload recovery, foreground/online checks, idempotent recovery after uncertain requests, guest-details validation and review. Guest contact details are never persisted in browser storage.

The mock uses shared browser-local non-personal hold records with Web Locks serialization. The HTTP service and proposed API contract are ready for backend agreement; production locking still belongs to the backend. Existing landing edits, gray section outlines, square rounded location placeholder and PHP 400 hourly rates were preserved.

Verification: 37 unit/component tests and 14 browser tests pass; lint and production build pass. Tests exercise expiry after a long pause, same-slot competition across tabs, final Open Play capacity, released holds, unchanged expiry after edits/retries, mismatched acknowledgements, malformed ownership data, private-data storage checks, guest validation and five responsive widths.

Handoff: [hold API contract](HOLD-API-CONTRACT.md). Screenshots use fictitious demonstration contact details: [review](screenshots/phase-3-review.jpg), [mobile guest details](screenshots/phase-3-mobile.jpg).

Next milestone is Phase 4 checkout and digital passes. No payment or confirmed booking is implemented in this phase.
## Phase 4 foundation — November 1

Prepared GCash/Maya/QRPh method selection in the guest review screen, a payment response contract and validator, a guard requiring both successful payment and confirmed booking before showing confirmation, and mock fixtures for pending/success/booking-pending/failure/cancellation/unknown states. Payment submission remains disabled; no payment or booking mutation is connected.

Verified: 43 unit/component tests pass, the payment-method preview browser test passes, lint passes, and production build passes. Existing Phase 3 hold behavior and landing-page design remain in place.

Resume on November 2, Asia/Manila: follow [PHASE-4-FOUNDATION.md](PHASE-4-FOUNDATION.md). Start with the payment-attempt controller and idempotent mock/API services, then payment dialogs, status recovery, confirmed receipt/QR pass and print styling. Phase 4 is not complete yet.
## Phase 4 implementation — November 1

Completed the payment foundation: accessible GCash/Maya/QRPh dialogs, mobile/reference validation, service-bound quote/revision checks, idempotent submission, three-second visible polling, two-minute delayed recovery, failed retry/cancellation, unknown/malformed/lost-acknowledgement reconciliation, confirmed receipt, per-booking opaque QR token and print/save-PDF layout. Mock payment/allocation operations share the same Web Lock/store as holds, keep confirmed slots booked, and protect pending allocation beyond the original timer.

Guest details remain memory-only and survive returning after failure within the page; refresh clears them. Recovered demo receipts explicitly indicate the cleared guest name. Backend must provide guestName in live receipts. Real QRPh, provider cancellation and by-key recovery need backend agreement; no money processing is implemented.

Handoff: [payment API contract](PAYMENT-API-CONTRACT.md). The foundation checklist above is historical and superseded by this implementation. Final verification results are recorded in the README after the test run.

Verification: 54 unit/component and 28 browser tests pass; lint/build pass. Desktop/mobile pass screenshots are saved under docs/screenshots/phase-4-*.jpg. No GitHub push or deployment was performed in this session.
