# Local payment integration for review

The Next.js frontend now connects to the existing `rim_rally_site` Django host.
`staff_api/api.py` translates the frontend's hold/payment/staff contract. Its
existing compatibility records refer to the canonical `payments.Booking`, Court,
PlaySession and Django user models. The documented payment-core REST handlers
remain available under `/api/payments/`; legacy `/payments/` and `/admin/` remain.
No merge, deployment, production import, real transfer or real email was performed.

## Decisions and behavior

- The user approved separate guest records. Only a random browser recovery
  credential authorizes guest access. Matching email/mobile does not attach a
  guest to a signed-in account. Staff may reuse a guest contact for a walk-in.
- Guest holds reserve inventory for ten minutes. Conversion verifies the current
  hold revision, server price and availability, then calls the payment service.
  Both the native REST API and frontend hold API respect the same allocation locks.
- Payment attempts map to BookingRecord plus the canonical Booking. Amounts are
  integer PHP centavos. Dates display in Asia/Manila. Stored courts, rates, sessions
  and booking counts replace demo schedule data when integration is enabled.
- `awaiting_payment` maps to pending payment/no confirmed booking;
  `pending_verification` additionally reports submitted proof; `confirmed` maps
  to succeeded/confirmed; expired/rejected/cancelled reservations report closed.
  A paid cancellation retains the paid state and separately reports cancellation.
- The unpaid deadline is PAYMENT_HOLD_MINUTES (default 10). Uploading proof changes
  it to PAYMENT_REVIEW_HOURS (default 24), capped at the start time. Expiry releases
  inventory and retains proof for reconciliation.
- Proof requires PNG/JPEG up to 5 MB and 16 megapixels, plus a nonblank reference
  up to 120 characters. The server decodes/re-encodes it as PNG. PDF/WebP support
  was removed from these upload forms. Private images require an owner credential
  or authorized staff session and use no-store responses.
- Staff review requires actual-transfer confirmation, recipient/amount/reference
  checking, and payment permissions. Confirm queues email; reject closes the
  booking and releases availability. A rejected booking cannot accept replacement
  proof. Contact the facility about money already sent; do not pay again to fix it.
- Existing policies are retained: staff process cancellation requests; paid
  cancellations require a refund decision. Refund recording documents an external
  refund; it does not transfer money. Staff can record cash for walk-ins. Guest
  requests cannot mark cash paid or choose an arbitrary customer identity.
- Signed passes are issued only for confirmed bookings. Authorized staff can call
  `GET /api/staff/tickets/<signed-token>` to verify the current booking state.
  Cancelled bookings and tampered tokens fail verification. This verifies booking
  eligibility, not physical attendance or a separate check-in time policy.

## Connection and configuration

Use the same arrangement locally and on Vercel: browser requests go to Next.js on
the frontend's own origin. Next forwards only allowlisted guest routes with the
recovery header; it never forwards staff cookies through that public proxy.
Staff server actions use DJANGO_API_BASE_URL privately, forwarding the Django
session/CSRF cookies and X-CSRFToken. No bearer tokens or database secrets belong
in NEXT_PUBLIC variables. Direct cross-origin browser access is not required.

Frontend environment (set before building):

```dotenv
NEXT_PUBLIC_BACKEND_ENABLED=1
NEXT_PUBLIC_API_MODE=server
NEXT_PUBLIC_API_BASE_URL=/api
DJANGO_API_BASE_URL=http://127.0.0.1:8000/api
STAFF_APP_ORIGIN=http://127.0.0.1:3000
```

Django environment:

```dotenv
DJANGO_DEBUG=1
DJANGO_ALLOWED_HOSTS=127.0.0.1,localhost
STAFF_APP_ORIGIN=http://127.0.0.1:3000
PAYMENTS_DB_PATH=.rim-rally/integration-demo.sqlite3
EMAIL_BACKEND=django.core.mail.backends.locmem.EmailBackend
```

For the final backend use DJANGO_DEBUG=0, a stable DJANGO_SECRET_KEY, your team's
existing DATABASE_URL, actual allowed backend hostname, HTTPS STAFF_APP_ORIGIN,
and real mail configuration. The host rejects SQLite on Vercel/in production.
Configure HTTPS forwarding with your backend provider before enabling deployment;
only trust forwarded headers from that provider's trusted proxy. Uploaded proof
and QR snapshots live in the database as binary data, not frontend public assets.
CSRF_TRUSTED_ORIGINS includes STAFF_APP_ORIGIN; cookie names are rim_rally_staff
and rim_rally_csrf, HttpOnly, SameSite=Lax and Secure outside local debug mode.

## Start a safe local demonstration

Install `.venv` dependencies using `python -m pip install -r requirements.txt` and
JavaScript dependencies using `npm ci`. Copy `.env.example` to `.env.local` and
`.env.django.example` to `.env.django.local` only if those ignored files do not
already exist; otherwise merge the listed values without replacing credentials.

From `C:/Users/user/Desktop/my-app`, run:

```powershell
npm run backend:dev
```

This explicit development command migrates only a separately named
integration-demo.sqlite3 and creates non-payable test instructions and a test
staff account. It refuses a hosted database. The fixed test login is
integration-admin@example.test / Integration-test-only!9331, only in that fixture.
Do not use these fixtures/passwords or QR images for real bookings.

In another terminal run `npm run dev`. The UI retains the existing navigation and
layout. Test QR instructions explicitly say TEST ONLY - DO NOT PAY. For real
instructions, use the authorized Django admin PaymentDestination configuration
and a reviewed inventory/database setup; do not populate shared data with seeds.

For a real first staff account, load the same Django environment and run:

```powershell
.venv/Scripts/python.exe manage.py bootstrap_staff admin@example.com
```

Open its private single-use /join# link. Do not bootstrap or import existing shared
records without the team's approval.

## Migrations and data preservation

The payment-core models and payment migration history are unchanged. The host adds
staff_api migration 0003: remove uniqueness of email/mobile pairs and add a contact
lookup index. This permits separate guests with identical contact details, retains
all existing rows/identifiers, and does not change the related payment records.
It was applied only to disposable databases. Review the team's current schema and
back up its database before applying it anywhere shared. Do not reverse the old
unique constraint after creating duplicate contacts without a reviewed data plan.

The host includes reviewed copies of payment-core services/models/images and DRF
adapters; a regression test checks those shared source files match. Changes to one
copy must be carried to the other until the team packages it as one dependency.
The optional PAYMENT_ALLOCATION_GUARD callback is documented in payment-core's
HOST-INTEGRATION.md. It must remain enabled wherever frontend holds coexist with
native reservations.

## Verification and repeat commands

Verified locally on 2026-11-20: 52 host Django tests; 26 standalone payment-core
tests; 74 frontend unit tests; Django checks and migration consistency; ESLint;
the enabled webpack production build; one full browser integration scenario with
mobile width and scoped WCAG accessibility checks; and restarting both local
servers while retaining the booking, private proof and original signed pass.
All three allocation concurrency tests ran against disposable file-backed SQLite.
The browser test also caught and verified the fix for asking for a QRPh transfer
reference before displaying payment instructions. The reference is now collected
only with the proof after the customer can view the stored QR.

All database tests use temporary accounts and file-backed SQLite with IMMEDIATE
transactions. Set disposable paths before Django commands:

```powershell
$env:DJANGO_DEBUG='1'
$env:PAYMENTS_DB_PATH="$env:TEMP/rim-payment-check.sqlite3"
$env:PAYMENTS_TEST_DB_PATH="$env:TEMP/rim-payment-check-test.sqlite3"
$env:EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend'
.venv/Scripts/python.exe manage.py check
.venv/Scripts/python.exe manage.py makemigrations --check --dry-run
.venv/Scripts/python.exe manage.py test payments staff_api --noinput
npm test
npm run lint
```

Build the integration with environment variables in the current terminal, or the
equivalent `.env.local` entries. Webpack is used because this Windows environment's
Turbopack worker previously failed:

```powershell
$env:NEXT_PUBLIC_BACKEND_ENABLED='1'
$env:NEXT_PUBLIC_API_MODE='server'
$env:DJANGO_API_BASE_URL='http://127.0.0.1:8051/api'
$env:STAFF_APP_ORIGIN='http://127.0.0.1:3051'
npm run build -- --webpack
npx playwright test --config integration.playwright.config.mjs
node scripts/verify-integration-restart.mjs
```

The integration browser test starts both servers, creates a fresh temporary
database and non-payable fixtures, and runs guest reservation, upload, staff review,
confirmation/pass verification, ownership denial, refresh and sign-out. The restart
check starts both servers again against that same disposable database and verifies
the saved booking, private proof and original signed pass. It refuses other paths.
Do not set NEXT_PUBLIC_API_MODE=mock for this check. Existing paused-mode tests
remain useful with NEXT_PUBLIC_BACKEND_ENABLED unset/0; their older browser suites
require a paused build rather than this enabled integration build.

Not verified against production: the team's database/locking behavior, final
accounts app, hosting/proxy configuration, SMTP delivery, actual funds received,
real refunds, or financial reconciliation. No provider charging/webhook/refund
processor is included. Schedule expire_bookings and send_payment_emails on the
final Django host after configuring and accepting those services.

## Restore the previous behavior

Set NEXT_PUBLIC_BACKEND_ENABLED=0 and rebuild to pause all dependent screens again.
Pre-integration versions of both projects were saved under the ignored
`.rim-rally/payment-integration-before/` directory, preserving earlier local edits.
Preview `python scripts/restore-payment-integration.py`; use `--apply` only if you
want to restore those exact versions. The script refuses to overwrite files edited
after this integration and does not touch databases, uploads, secrets or Git history.
Disposable integration databases may be retained for review or removed separately
after both servers stop. There is no production data rollback to perform.
