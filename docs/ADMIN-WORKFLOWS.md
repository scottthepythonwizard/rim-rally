# Stored admin and guest workflows

The local staff API views and routes have been removed while the replacement
backend is being built. Staff screens and live booking actions currently show
“Temporarily unavailable.” The workflows below describe the previous integration;
models, migrations, databases and uploaded proofs have been preserved.

The Next.js app now manages bookings in the same private SQLite database as staff accounts. There are no Django views or models in this checkout. This implementation runs locally without a separate Django server.

## Setup

Use Node.js 24, a long-running Node server and persistent private disk. Copy the settings in `.env.example` if needed: `NEXT_PUBLIC_API_MODE=server`, `NEXT_PUBLIC_API_BASE_URL=/api`, plus the staff origin and database path described in STAFF-ACCESS.md. Unset public API settings also select the shared server mode. Changing public settings requires rebuilding. Existing `mock` settings deliberately keep guest bookings in demo mode and do not connect those bookings to staff storage.

`STAFF_DB_PATH` contains staff credentials, customer contact details, bookings and uploaded proof. Keep it outside public assets and limit operating-system access to the service account. Back it up with a SQLite-aware backup tool, including uploaded proofs stored in the database. Do not deploy this file on temporary/serverless disks. All app processes must share this database on a host that supports SQLite locking; distributed/multi-region hosting needs a shared database service instead.

## Staff navigation

- Open Play schedules: existing create/edit/cancel/delete features; occupied sessions cannot be removed or have their allocation changed until their bookings/holds are cleared.
- Bookings: court bookings and Open Play registrations, with customer search, date/type/status filters and pages of 50 results.
- Customers: search name, email or mobile; open a customer's contact details/history and start another booking with their details filled in. Exact normalized email plus mobile reuse the existing customer record. Different contact pairs remain separate customers.
- Payments: filter payment status and open the booking to inspect proof. Proof submitted is separate from payment verified.
- Cancellations: up to 100 requests, pending first with reason, request date, processing status and refund status.
- Add walk-in: choose a court and consecutive whole hours, or a published Open Play session. The server checks availability and capacity when saving. Cash received confirms payment immediately; unpaid and wallet methods reserve the place for staff follow-up.
- Sessions: current/upcoming court bookings and Open Play sessions in Asia/Manila, including confirmed players, reserved/held places and remaining capacity. Open a session's participant list or booking details.
- Accounts: existing admin-only invitations and account access management. Staff cannot manage accounts.

Both active staff and admins may manage operational booking data. All reads and writes check the staff session on the server. The booking activity log records staff identity and the time of consequential changes. Guests can access only their own booking/payment through the recovery credential in their checkout tab.

## Payment review

Guest checkout creates a reserved booking with payment pending. Guests upload a JPEG, PNG, WebP or PDF, up to 5 MB; staff can also submit proof on the booking. Supported file signatures and size are checked on the server. Proof files are served only to signed-in staff with private, uncached responses; PDFs download as attachments.

Staff compare the proof to money actually received, then verify or reject it. Rejection requires a reason and permits a replacement upload. Verification confirms the booking and digital pass. Duplicate reviews/submissions are rejected. Walk-in cash is recorded only when staff confirm that cash has actually been received; an unpaid walk-in may be marked cash received later.

No payment gateway charges money, automatically verifies transfers, or sends refunds. Use the facility's actual payment instructions/QR outside this app before uploading proof. The app does not invent a payable QR. Configure and communicate the facility's real recipient details before public use. Existing hourly inventory/rate is preserved: 3 pickleball courts, 1 basketball half-court, 8 AM–midnight, PHP 400 per court hour; staff set Open Play prices and capacities.

## Cancellation and refund policy

Guests and staff can record a cancellation request. Staff must confirm before completing it. Completion cancels the booking and releases court time or one Open Play place in the same database transaction. An unpaid cancellation requires a recorded decision but no refund. Paid cancellations require staff to choose refund pending, refund already sent, or no refund due, and record an explanation/reference. Payment received remains recorded even after cancellation. Pending refunds can later be marked sent with a reference. These actions record external refund work; they do not move money.

Temporary unsubmitted holds expire after 10 minutes. A booking awaiting payment review remains reserved until staff cancel it or verify payment. This avoids reselling a place while payment is being checked. Staff need to review pending bookings regularly; automatic abandonment timeouts and cancellation cutoffs are not configured.

## Storage and safeguards

New tables are created automatically without deleting existing staff data: `customers`, `booking_holds`, `booking_requests`, `bookings`, `booking_payments`, `payment_proofs`, `booking_cancellations`, `booking_audit`. Booking records link customers, holds, payments, sessions and staff creators. Amounts use whole centavos; timestamps include a time zone. Proof contents are private binary data in SQLite. Holds snapshot the agreed price/selection so later schedule changes do not rewrite booking history.

SQLite `BEGIN IMMEDIATE` serializes allocation checks and writes, preventing simultaneous court/session reservations from overbooking. Request identifiers prevent repeated submissions from creating duplicate bookings/payments. Guest access credentials are hashed. Browser/session recovery is required to resume guest checkout; an account-based customer portal, email recovery, automatic refunds and check-in scanning are outside this workflow.

## Verification

Run `npm run lint`, `npm test`, `npm run build`, `npm run test:staff`, and `npx playwright test --config admin.playwright.config.mjs`. If the local Turbopack CSS subprocess fails, `npm run build -- --webpack` is a supported build fallback. Browser tests use isolated temporary databases and test-only accounts, uploads and payments. Server-mode admin tests require a server-mode build. Older demo booking browser tests require a build with `NEXT_PUBLIC_API_MODE=mock`, then `npx playwright test --config demo.playwright.config.mjs`; rebuild with `NEXT_PUBLIC_API_MODE=server` afterward. Both browser configurations use separate local servers and never reuse a live server. Screenshots go to ignored test output rather than overwriting documentation images.
