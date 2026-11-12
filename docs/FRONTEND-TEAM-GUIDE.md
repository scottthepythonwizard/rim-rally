# Rim & Rally: frontend explained for the team

Prepared November 4, 2026, from the current code in C:/Users/user/Desktop/my-app.

This guide explains the current implementation. It does not add features or change the UI. The app is a completed guest-booking frontend with browser simulations; production booking still needs the dedicated backend and real payment integration.

## 1. Start with this explanation

The frontend is everything the guest sees and interacts with: pages, buttons, calendar, court grid, forms, payment dialogs and digital pass. It also remembers the current screen and asks services for data.

The backend is the authority: it decides whether a court/place can be reserved, holds it for the guest, calculates the official price, verifies payment and creates the booking. The database stores the records behind that backend. The frontend never connects directly to the database.

The normal flow is: guest chooses a sport/date/time → service acknowledges a temporary hold → guest enters details → service handles a payment attempt → confirmed booking is fetched → frontend displays the pass.

During development, files in src/mocks/ simulate the responses a backend would provide. They are supporting demonstrations, not a deployed backend or a production database.

### Words used in the code

- Component: a reusable piece of screen, such as a button or court card.
- Props: values and callbacks passed into a component by its parent.
- State: information the browser remembers while the page runs, such as the selected method.
- Hook: reusable React behavior; useHoldFlow is our main booking-behavior hook.
- Service: the layer a component calls when it needs remote data or an action.
- API: the agreed way frontend and backend exchange requests and responses.
- Contract: the names, types and meanings both sides agree to exchange.
- Mock: a local simulation used while the real service is unavailable.
- Reducer: a function that turns the previous state plus an event into the next state.
- Idempotency key: a unique operation label. Repeating the same operation with that key must not create another charge or reservation.
- Polling: checking the service repeatedly for an updated result.
- Reconciliation: checking what actually happened after a response was lost or delayed.
- Opaque ID/token: a value treated as an identifier; the frontend should not infer its meaning or permission from its contents.

## 2. File structure, explained file by file

Every path below is relative to C:/Users/user/Desktop/my-app. In imports, @/ means src/ because jsconfig.json defines that shortcut. For example, @/services/hold-service means src/services/hold-service.js.

### src/app/ — pages and URLs

Next.js uses folders to decide URLs. page.jsx is the screen for that folder. A bracketed name, such as [facilityId], is a changing URL value, not a literal folder name in the browser.

- src/app/layout.jsx: shared outer page. Imports the global stylesheet and adds the header, footer, skip link, page metadata and language setting around each route.
- src/app/page.jsx: the home page at /. Gets facility data through facility-service and assembles Hero, CourtDiscovery, MembershipSection and LocationSection.
- src/app/globals.css: Tailwind setup, local font declarations, shared color/font tokens, focus styling, reduced-motion behavior and print rules. Most visual styling stays in component Tailwind classes.
- src/app/loading.jsx: temporary loading/skeleton UI while a route is being prepared.
- src/app/error.jsx: client error boundary for unexpected rendering failures, with a retry action. Expected booking conflicts are handled inside the booking UI instead.
- src/app/not-found.jsx: the friendly missing-page/resource screen.
- src/app/facilities/[facilityId]/page.jsx: /facilities/rim-and-rally. Loads the facility, shows its overview, placeholder image, amenities and court cards, or returns not-found for an unknown ID.
- src/app/book/[facilityId]/page.jsx: /book/rim-and-rally. A server-rendered reservation shell. It loads the facility, supplies an initial server timestamp and renders interactive BookingFlow inside Suspense.
- src/app/book/[facilityId]/loading.jsx: booking-route loading UI.
- src/app/booking/[bookingId]/confirmation/page.jsx: /booking/a-booking-id/confirmation. Reads the booking ID from the route and renders the client confirmation view. Metadata prevents indexing of the pass page.
- src/app/booking/[bookingId]/confirmation/loading.jsx: pass-loading screen.
- src/app/booking/[bookingId]/confirmation/error.jsx: unexpected pass-rendering error with a retry action; it does not declare the payment failed.

Most page shells are Server Components. Interactive components use "use client" because they need events, hooks, browser storage or browser APIs. A Server Component is still part of this presentation tier; it is not permission to implement booking business logic or query the database directly. Current Next.js route params are awaited in the page files.

### src/components/ — pieces shared between pages

- src/components/brand.jsx: the approximate R logo and the Rim & Rally wordmark/home link.
- src/components/site-header.jsx: navigation and login notice; uses the mobile menu on smaller screens.
- src/components/mobile-menu.jsx: browser disclosure menu that closes after following a link.
- src/components/site-footer.jsx: grouped booking/facility links, brand and newsletter notice.
- src/components/landing.jsx: exports the four main home-page sections: Hero, CourtDiscovery, MembershipSection and LocationSection. Approved content and placeholder composition live here.
- src/components/ui.jsx: reusable ButtonLink, Eyebrow and Arrow, plus common button styling.
- src/components/notice-button.jsx: opens an accessible explanatory dialog for unavailable actions such as login, membership purchases and newsletter signup. It does not implement those operations.

### src/features/booking/ — schedule, hold and guest details

- src/features/booking/booking-flow.jsx: main interactive coordinator. Reads sport/date/mode/court from the URL, changes those options, loads/refreshes availability, ignores obsolete reads, mounts the current booking step and restores an existing payment-status screen when needed. Its internal ScheduleScope uses useHoldFlow and renders the matrix/Open Play, guest form or review with a price summary.
- src/features/booking/date-navigation.jsx: date heading, Today/previous/next actions and the styled React DayPicker calendar dialog. Uses Philippine dates and disables past days.
- src/features/booking/booking-matrix.jsx: desktop court-column/time-row table and mobile one-court hourly list. Also contains SlotButton, SlotLegend and PriceBadge. It receives data and callbacks; it does not contact a database or decide production prices.
- src/features/booking/open-play.jsx: session cards with times, registered players, held places, remaining capacity and one-place selection. Full/started sessions cannot be selected.
- src/features/booking/price-summary.jsx: displays acknowledged selected hours/session, per-item amounts and the PHP total, with hold cancellation and next-step content supplied by its parent.
- src/features/booking/hold-countdown.jsx: displays time remaining and announces meaningful expiry thresholds. It does not create or extend a hold.
- src/features/booking/guest-details.jsx: guest name/email/mobile fields and their validation feedback. Its GuestReview export displays the guest information and payment-method selection.
- src/features/booking/hold-state.js: initial hold state, holdReducer, contextKey, remainingMs, normalizeMobile and validateGuest. This is shared state/format validation logic, not backend authorization.
- src/features/booking/use-hold-flow.js: main hold controller. Creates/updates/releases/revalidates holds through hold-service, preserves acknowledged selection after conflicts, handles expiry and lost responses, stores opaque recovery metadata, keeps contact fields in memory and moves between selection/details/review.
- src/features/booking/scheduling.js: date/time/PHP formatting, hourly boundaries, URL option normalization, selectable checks, consecutive-hour selection and totals. It also contains the earlier selectionReducer; the current acknowledged-hold flow is controlled by useHoldFlow and holdReducer, so selectionReducer is not the main current booking controller.

### src/features/checkout/ — payment UI and pass

- src/features/checkout/payment-contract.js: method/status constants, JSDoc PaymentAttempt description and canShowConfirmation. Shared vocabulary keeps services and UI consistent.
- src/features/checkout/payment-methods.jsx: GCash/Maya/QRPh choices, wallet/reference inputs, demonstration QR, dialog focus handling and demo outcome controls. It rechecks the hold and saves an opaque operation record before handing submission to the status controller. Wallet/reference input alone never confirms payment.
- src/features/checkout/payment-status.jsx: submits once, checks the same attempt, handles pending/unknown/failed results and offers retry/cancel where allowed. Polls while visible and navigates to confirmation only after the service confirms payment and booking allocation.
- src/features/checkout/confirmation.jsx: retrieves and displays the verified receipt, court/session, guest name, amount, token QR and Print / Save as PDF. It hides a stale receipt when the booking ID changes and waits for the current QR before enabling Print.
- src/features/checkout/ticket-qr.jsx: uses the qrcode package to encode a token locally into SVG. It creates an image, not a payment or an authorization decision. The backend must verify a real ticket when scanned.

### src/services/ — the connection point for backend integration

- src/services/api-client.js: shared HTTP transport. requestJson/getJson send JSON requests, attach headers, disable fetch caching, support cancellation and use a 15-second timeout. ApiError and normalizeError turn unexpected failures into a consistent frontend error shape without displaying raw server bodies.
- src/services/facility-service.js: getFacility/listFacilities return cloned static fixture data. IMPORTANT: facility discovery has no HTTP adapter yet, even when the other services use HTTP mode.
- src/services/scheduling-service.js: getSchedule chooses mock or HTTP availability/Open Play. validateSchedule checks timestamps, 16 hourly entries, ownership, amounts and capacities, and verifies that the response matches the requested facility/sport/date.
- src/services/hold-service.js: createHold/updateHold/getHold/releaseHold and mock expiry control. Chooses mock/HTTP transport and validates quote arithmetic, selection, context and acknowledgements before the UI accepts protection.
- src/services/payment-service.js: payment method catalogue and validatePaymentAttempt. getPaymentPreview returns static contract fixtures for tests; it is not the runtime payment submission service.
- src/services/payment-operations.js: submitPayment/checkPayment/cancelFailedPayment/getBooking and validateBooking. Connects runtime checkout to mock/HTTP operations, matches payment/receipt data to the acknowledged hold and rejects invalid receipts. In HTTP mode, cancellation currently explains that facility assistance is required rather than inventing a provider cancellation endpoint.

If the backend URL, request fields or response shape changes, update these services/contracts first. Avoid scattering fetch calls across buttons and cards.

### src/mocks/ — simulated service behavior

- src/mocks/fixtures.js: sample facility, court-card, image and amenity information.
- src/mocks/scheduling.js: creates 16 hourly slot entries and sample Open Play sessions, plus sold-out/empty scenarios. Current private rates are 40000 centavos for both sports; there is one basketball half-court and a three-court pickleball fixture.
- src/mocks/hold-engine.js: browser simulation of temporary holds. Uses injected storage/clock/locking helpers for testing; the browser adapter uses localStorage and Web Locks to coordinate same-origin tabs. Adds held/booked ownership data to mock availability.
- src/mocks/payments.js: fixed example payment responses for contract tests, including pending, failed, unknown and confirmed combinations.
- src/mocks/payment-engine.js: runtime simulated submission/settlement/cancellation/receipt. Shares the hold engine's store/lock so a pending payment retains its allocation and a confirmed resource becomes booked. Does not process money or store guest contact input.

These engines are examples of behavior the frontend needs to handle. They are not backend code to copy unchanged into production, and they cannot lock courts across different customers/devices.

### public/ — files the browser can load directly

- public/fonts/: local 42dot Sans and Noto Serif font files and their licenses.
- public/images/placeholder.svg: the intentionally displayed image placeholder.
- Other existing reference photographs are unused; do not add them to the UI without the user's instruction. See docs/ASSETS.md.

### tests/ — checks that protect existing behavior

- tests/setup.js: shared DOM testing setup and cleanup.
- tests/scheduling.test.js: date/time/selection/total helpers.
- tests/services.test.js: availability validation, malformed errors, timeouts and cancellation.
- tests/booking-ui.test.jsx: scheduling UI behavior and labels.
- tests/holds.test.js: hold engine/controller helpers, conflict, expiry, recovery and validation.
- tests/payments.test.js: payment contract fixtures and validation.
- tests/payment-methods.test.jsx: accessible method choices and availability gating. Its preview-style test name is historical; submission is disabled there because no checkout callback is supplied.
- tests/payment-engine.test.js: simulated settlement, idempotency, ownership, failure/cancel and allocation behavior.
- tests/booking-contract.test.js: confirmed receipt context, hours, names and invalid payloads.
- tests/confirmation.test.jsx: stale-receipt protection and QR readiness before printing.
- tests/e2e/booking.spec.js: full browser scheduling flows.
- tests/e2e/holds.spec.js: browser holds, competing tabs, expiry/recovery and guest form.
- tests/e2e/checkout.spec.js: all methods, failure/retry/cancel, uncertainty, receipts, print media and privacy checks.
- tests/e2e/payment-foundation.spec.js: payment method selection from review; the filename comes from the original foundation milestone.
- tests/e2e/verification.spec.js: accessibility scans, responsive checks and protected/missing-resource views.

Unit/component tests inspect smaller pieces. End-to-end tests open a browser and follow the guest's actual journey. The checked release passed 61 unit/component tests and 35 browser tests; that describes that release's evidence, not proof that future changes are safe without retesting.

### Root files and documents

- package.json: dependencies and commands such as dev, build, start, lint and tests.
- package-lock.json: exact dependency resolution for reproducible npm ci installs; keep it with the source.
- next.config.mjs: Next.js configuration.
- postcss.config.mjs: CSS processing/Tailwind plugin configuration.
- eslint.config.mjs: code-quality/lint configuration.
- jsconfig.json: JavaScript import aliases, including @/ → src/.
- vitest.config.mjs: unit/component test environment and file matching.
- playwright.config.mjs: browser test configuration, local server and optional PLAYWRIGHT_BASE_URL.
- .env.example: public mock/HTTP mode and API URL examples. Local real values go in an untracked .env.local.
- .gitignore: excludes dependencies, build output, private environment files and generated test results.
- AGENTS.md: instructions for coding assistants, including reading installed Next.js documentation before editing. The application does not need it to run.
- README.md: installation, commands and current project status.
- docs/API-CONTRACT.md: availability/Open Play request and response expectations.
- docs/HOLD-API-CONTRACT.md: holds, revisions, credentials, expiry and recovery.
- docs/PAYMENT-API-CONTRACT.md: payment attempts, uncertain results, receipts and provider gaps.
- docs/ARCHITECTURE.md: presentation/service/backend boundaries.
- docs/ASSETS.md: approved colors/fonts and outstanding original assets.
- docs/HANDOFF.md: team setup, integration responsibilities and demo sequence.
- docs/ROADMAP.md: completed milestones and accepted scope/rollback history.
- docs/PHASE-4-FOUNDATION.md: historical preparation notes, superseded by the implemented checkout.
- docs/PHASE-5-VERIFICATION.md: findings, fixes, verification evidence and limits.
- docs/FINAL-DELIVERY.md: final checklist and external acceptance gates.
- docs/DELIVERY-MANIFEST.json: hashes identifying the checked source/assets/tests/config baseline. Documentation-only additions do not alter those application hashes.
- docs/screenshots/: saved visual evidence using fictitious demo data.
- docs/FRONTEND-TEAM-GUIDE.md: this beginner-friendly explanation.

node_modules/ is installed dependencies; .next/ is generated build output; test-results/ is generated test output; .git/ is Git history. Do not edit these folders to change application behavior.

## 3. Important code, in easy language

### A. One controller connects the booking screen

booking-flow.jsx coordinates what the guest is currently doing. It passes display data and callbacks to smaller components. The matrix's job is to draw slots and report a click; useHoldFlow's job is to ask the service to secure/update that selection.

This separation lets the backend connection change without rewriting every card and button.

### B. URL state makes the selected view recoverable

The URL holds sport, date, court and mode. Opening a booking URL can return to that view; changing a date updates the URL. It does not prove that a hold or booking exists. Hold ownership is separately revalidated through the service.

### C. holdReducer controls consistent UI transitions

In hold-state.js, REQUEST means the app is waiting for acknowledgement. ACK means a valid service response was accepted. EXPIRED clears the usable hold. UNVERIFIED prevents checkout until the service is checked again. STEP changes selection/details/review.

Think of these as traffic lights: a click does not turn the light green; an accepted service acknowledgement does.

### D. useHoldFlow manages the difficult cases

Its mutate function creates/edits selection; accept stores a valid acknowledgement; recover rechecks/replays the original operation; cancel waits for a release result. enterDetails and reviewGuest revalidate before moving forward.

If a requested update conflicts, the last acknowledged selection is preserved. If the outcome is uncertain, the UI blocks progression and checks the same operation rather than assuming it failed and creating another.

### E. The timer calculates time; it does not own the reservation

remainingMs uses expiresAt, the returned serverNow and monotonic elapsed browser time. Interval callbacks refresh the display instead of subtracting one second from a counter. Returning to a tab triggers another service check.

Only the backend can enforce a real ten-minute lock. Adding/removing adjacent hours must preserve the original expiry.

### F. Selection helpers improve UX; backend validation stays necessary

toggleSlot accepts consecutive hours on one court and rejects a gap. For example, 8–9 plus 9–10 is allowed; 8–9 plus 11–12 is rejected. The backend must repeat this validation because browser code and requests can be changed.

atHour handles 24 as next-day midnight. money formats integer centavos for display: 40000 centavos becomes ₱400. The frontend displays and sums supplied prices; production pricing policy belongs to the backend.

### G. Services validate responses before rendering them

validateSchedule, validateHold, validatePaymentAttempt and validateBooking check the shape and meaning of incoming data. A response with a wrong date, decimal/string amount, invalid status or mismatched hold is rejected instead of becoming a misleading screen.

requestJson is the common fetch wrapper. AbortController cancels obsolete reads and supports timeouts. A timeout stops waiting; it does not prove a server-side write did not finish.

### H. Idempotency protects retries

Before a hold/payment write, the frontend assigns an operation key. If the response disappears, use the same key to reconcile/replay that operation. Example: one payment committed but its response was lost; checking its original key should find it, not charge again.

The backend must implement the guarantee. A frontend UUID by itself does not prevent duplicate payments.

### I. Payment success and booking confirmation are separate

canShowConfirmation in payment-contract.js requires status=succeeded AND bookingStatus=confirmed AND a bookingId. If money is received but allocation is still pending, the UI keeps checking rather than showing a pass.

payment-status.jsx then navigates to confirmation, and getBooking fetches/validates the actual confirmed receipt. A reference entered by the guest, a wallet number or a QR scan is not evidence of success.

### J. Browser storage is deliberately limited

React memory holds guest and payment inputs. sessionStorage holds the opaque recovery credential, operation IDs/keys and non-sensitive context/amount/method metadata. The mock uses localStorage for non-personal simulated allocation/payment records and a credential hash.

Contact name/email/mobile and payment references are not persisted in browser storage. Consequently, refreshing clears those inputs; the production backend must return guestName for a recovered receipt. Mock storage is not a production record store.

### K. QR generation and print are presentation tasks

ticket-qr.jsx encodes an opaque token; confirmation.jsx displays it and calls window.print for Print / Save as PDF. Print CSS removes navigation/footer/actions. The token contains no guest contact details. Real admission validity needs a backend verification/check-in flow; that staff/scanner application is outside this guest frontend.

## 4. What the backend team needs to know

### Agree on contracts before implementation/integration

These endpoints are frontend expectations to review with the backend team:

- GET /facilities and GET /facilities/:id: proposed discovery data; frontend HTTP discovery still needs to be implemented.
- GET /availability: hourly courts/slots for facility, sport and Manila date.
- GET /open-play: sessions, prices, capacity and held/registered counts.
- POST /holds: create a temporary hold.
- PATCH /holds/:id: atomic replacement of selected private hours, with expected revision and unchanged deadline.
- GET /holds/:id: revalidate/recover.
- DELETE /holds/:id: release; return released=true or HTTP 204.
- POST /payment-attempts: start one payment operation with the original hold and guest/payment input.
- GET /payment-attempts/:id: check the attempt.
- GET /payment-attempts/by-key/:idempotencyKey: recover an attempt whose creation response never reached the client.
- GET /bookings/:id: retrieve the confirmed receipt and ticket token using the guest credential.

The contract documents have the complete fields. Names and formats can be agreed differently, but the frontend services and validators must be updated together.

### Dates and amounts must be consistent

- Use Asia/Manila calendar dates and ISO timestamps with explicit timezone/offset.
- Return 16 ordered hourly intervals, 08:00–next-day 00:00, including unavailable ones so columns align.
- Last interval: 23:00 that date → 00:00 the next date.
- Use currency PHP and safe integer centavos; 40000 means ₱400, not 40000 pesos.
- Prices and bands come from the backend. Current private court price is ₱400/hour for both sports; Open Play has separate per-player mock amounts requiring confirmation.
- Return explicit courtName/guestName/facilityName in the receipt; court IDs are not display labels.

### Real locking must be atomic across customers

Two guests can click the same available slot before either screen refreshes. Only one can receive the real allocation. Backend hold creation/update must enforce that atomically, account for Open Play's last place and coordinate private/Open Play use of the same physical resource if their times overlap.

Availability refresh every 30 seconds is a display update, not booking protection. heldByYou and heldCount must be accurate. Adding hours must either update the whole hold successfully or leave the previous acknowledged selection intact.

### Credentials and repeated operations need an agreed design

Current protected calls use X-Guest-Recovery. The frontend proposal generates a random credential before hold creation; the mock stores its hash. This is not a completed production authentication solution. Agree whether the backend accepts this design or issues a different credential/session and update services accordingly.

IDs alone do not grant access. Validate ownership on every hold/payment/booking operation, use HTTPS and avoid logging recovery credentials. Bind idempotency keys to the guest and request, and retain results long enough to recover delayed/expired operations.

The browser calls the dedicated API directly. Configure CORS for the actual frontend origin and headers Content-Type, Idempotency-Key and X-Guest-Recovery. The current HTTP wrapper does not enable cross-origin cookie credentials; if the backend chooses cookie sessions, the service/CORS/CSRF approach must change together. Do not add authentication engines to presentational components.

### Payment is the biggest remaining integration

Backend/provider must initiate the actual wallet approval/payment flow, verify authenticated provider notifications/status, and confirm allocation. A mobile number or user-entered reference does not authorize a transfer.

The current frontend also needs the agreed real provider handoff/approval UX. Live QRPh submission is deliberately disabled because no provider-issued payable QR has been connected. The demonstration QR is not a payment QR. Merchant secrets and provider verification belong to the backend, never NEXT_PUBLIC variables or frontend source.

Before starting payment, revalidate holdId, holdRevision and expectedAmount against the backend's quote. Treat expectedAmount as a stale-quote check, never as permission for the client to set the price.

If payment is pending/unknown when the normal hold deadline passes, backend must reconcile money and allocation. The browser timer must not cause a paid guest to lose their place or trigger another charge. Returning unknown indefinitely needs an agreed facility/provider support/recovery path.

Current polling is every three seconds while visible; after two minutes the UI shows delayed status, not automatic failure. The shared request timeout is 15 seconds. Plan response statuses and rate limits around that behavior.

Mock cancellation is only allowed after definitive failure. HTTP cancellation currently shows that facility assistance is needed. Agree on provider cancellation/refund rules and a real endpoint/UX before enabling it; deleting a hold cannot cancel a charge.

### Errors should be predictable and safe

Use suitable HTTP statuses and an error object with code, safe message, fieldErrors, retryable and optional requestId. The current client standardizes guest-facing messages and preserves useful codes/field errors rather than echoing arbitrary server text.

Useful examples: CONFLICT when selection was taken, REVISION_CONFLICT when an edit is stale, HOLD_EXPIRED when the hold is unusable, INVALID_FIELDS for invalid input, and HTTP 429 for throttling. Never return stack traces or database exceptions as field messages. A failed request/timeout must not be treated as proof that a payment was not created.

### Switching from mock to live requires a coordinated checklist

1. Agree on request/response, ownership, idempotency and provider contracts.
2. Implement and test the backend's real allocation/payment/booking behavior.
3. Update the service adapters for any agreed differences and add HTTP facility discovery.
4. Connect real wallet approval, provider-issued QRPh and agreed cancellation/recovery flows.
5. Set NEXT_PUBLIC_API_MODE=http and NEXT_PUBLIC_API_BASE_URL in .env.local for integration testing, then restart development or rebuild/restart production. NEXT_PUBLIC settings are public build-time configuration, not secret storage.
6. Test real conflicts, expiry during payment, lost responses, duplicate submission, receipts and tickets together.
7. Remove/update remaining demonstration copy and controls only after verified live behavior. Some controls already hide in HTTP mode; labels/content are not all governed by that switch.
8. Retain mock fixtures and tests for regression testing if useful; they do not have to be deleted to run live services.

Do not tell the team that changing the environment variables alone makes real payments ready. The code supplies the integration structure, while the provider-specific UX and remaining adapters still require agreed implementation and testing.

## 5. Suggested walkthrough for a team meeting

First show app/page.jsx: it builds the home page from components. Then open booking-flow.jsx: it connects schedule controls, useHoldFlow and the next screens. Follow one slot click into use-hold-flow.js, then hold-service.js, then the mock/HTTP choice. Show hold-state.js to explain REQUEST/ACK/EXPIRED. Next show payment-status.jsx and canShowConfirmation to explain why payment and allocation must both be verified. Finish with the three API contract documents and the live-integration checklist above.

Short version you can say aloud: “Our frontend handles the screens and the guest's progress. Services are its connection to your API. Mocks let us test success and failure before the backend exists. Your backend must own prices, locks, payment verification and confirmed bookings. We'll connect the agreed services and provider flow, then test both sides before accepting real bookings.”

## WHAT COULD I BE WRONG ABOUT?

- Timer updates may pause in a background tab. The UI derives remaining time and revalidates on return, but only the backend's independent clock/hold rules can enforce protection.
- Backend formats and delays may differ from the proposed contract. Service validators may reject a response until both teams agree on it. Preserve recovery identifiers, reconcile uncertain writes and test delays/malformed responses during integration.
- This guide explains the current files; it does not verify an unseen backend/provider implementation. The contract details must be reviewed with that team before live use.
