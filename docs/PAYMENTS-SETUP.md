# Manual QR payments — setup and GitHub handoff

This backend follows the requested manual workflow: choose court/Open Play and date/time → customer login → owner QR and server-calculated total → upload payment proof → pending verification → staff checks the actual account → confirmed booking and confirmation email.

This is manual payment verification. It does not call GCash/Maya APIs, automatically detect transfers, or issue refunds.

## Upload to GitHub

Extract `payment-backend-upload.zip`. Copy the contents into the **root** of the existing Rim & Rally repository (the folder containing `manage.py` and `package.json`). Preserve the folders. Do not create an extra `payment-backend-upload/` folder inside the repository.

Add the new `payments/`, `rim_rally_site/`, `.env.payments.example`, and payment documentation files. Replace `requirements.txt`, `.gitignore`, `README.md`, and `views/views.py` with the included versions. `PAYMENTS-FILE-MANIFEST.json` identifies every file and whether it is added or changed, with SHA-256 checksums.

The supplied source had `manage.py` pointing at `rim_rally_site.settings`, but the settings package was absent. This package supplies it. If your GitHub branch already has that package, merge the settings and put `path("payments/", include("payments.urls"))` **before** the catch-all `views.urls` route. Do not replace production database or email settings blindly.

The single change to `views/views.py` exempts the **Next.js reverse-proxy route** from Django CSRF checks so existing Next.js server actions continue working; Next handles those requests' Origin validation. All new Django payment/auth/admin POST forms retain Django CSRF protection.

## Local setup (PowerShell)

Use Python 3.12–3.15. Run from the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:DJANGO_DEBUG = "1"
$env:DJANGO_SECRET_KEY = (& .\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(48))")
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py createsuperuser
.\.venv\Scripts\python.exe manage.py seed_payment_courts
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

The payment pages run without Node.js. The existing Next.js booking/dashboard pages still require the original Node server; see `docs/DJANGO.md`. The customer payment entry point is [http://127.0.0.1:8000/payments/book/](http://127.0.0.1:8000/payments/book/).

Environment variables are read from the process. `.env.payments.example` is a reference; Django does not automatically load it. In a second terminal set the same environment variables before running management commands. Never commit real secrets, databases or customer receipts.

## Configure the owner and inventory

1. Open [http://127.0.0.1:8000/admin/](http://127.0.0.1:8000/admin/) and sign in with the Django superuser.
2. Under **Courts**, confirm actual courts and prices. Money is stored in centavos: `40000` means PHP 400. The seed command adds one pickleball court and one basketball half-court; it does not assume three real pickleball courts. Add more only if they exist.
3. Under **Payment destinations**, add the payment label, actual owner/payee name, actual payment account and actual QR image. Mark it active. Only one destination can be active. No fake QR is supplied. Use PNG/JPEG up to 5 MB.
4. Optionally add **Play sessions** with a court, start/end, capacity and per-player amount in centavos. Dates use Asia/Manila. Open Play reserves one seat. Active Open Play sessions block private court rentals during the same period. Sessions with bookings cannot be edited; coordinate changes with customers outside this initial module.

Existing bookings retain a snapshot of the amount and payment destination even if the owner changes rates or QR instructions afterward.

## Customers and staff

Customers can browse `/payments/book/` without login. Creating a reservation requires an active signed-in account with an email. Customers sign up at `/payments/signup/` and sign in at `/payments/login/`, using their email as username. Signup never grants staff privileges. Confirmation goes to the email saved from the signed-in account when the booking was created, not an arbitrary checkout field. Email ownership verification and password-reset UX are not included in this module.

**Django payment accounts and `/admin/` are separate from the existing Next.js staff SQLite accounts and `/dashboard`.** Neither store is automatically synchronized. The Django superuser can create staff users through `/admin/auth/user/`, enable `is_staff`, and grant `payments.view_booking` plus `payments.change_booking` (directly or via a group). Grant only those permissions for reviewers. Reviewers do not need permission to change users, destinations or court pricing.

To review: open **Bookings**, filter **Pending verification**, click **Review booking and transfer**, open the private receipt, check the transfer in the actual wallet/bank account, enter the verified bank reference and note, tick the verification checkbox, then confirm or reject. Review notes are visible to the customer. Status, total, customer and receipt cannot be edited through the normal booking admin form. The review records who acted and when. Rejection releases capacity but does not refund money automatically.

## Expiration and email jobs

Defaults:

- Payment deadline: **10 minutes**, capped at the booking start.
- After receipt upload: **24 hours for staff review**, capped at the booking start.
- After either deadline: the booking expires and the slot/seat becomes available.
- Confirmed bookings keep the slot. Receipt and review records remain for reconciliation.

Set `PAYMENT_HOLD_MINUTES` (1–60) and `PAYMENT_REVIEW_HOURS` (1–168) to change the policy. Expired payment submissions cannot silently reclaim a slot. Staff cannot confirm expired bookings; reconcile or refund transfers manually before making a new reservation. Tell customers this policy before collecting real payments.

Run these commands **every minute** with your host's scheduler or Windows Task Scheduler, using the same database and environment as the web app:

```powershell
.\.venv\Scripts\python.exe manage.py expire_bookings
.\.venv\Scripts\python.exe manage.py send_payment_emails --limit 50
```

Availability checks/reservation requests also ignore expired holds, so a missed scheduled expiry run does not retain slots indefinitely. The email worker is required to send queued emails; confirmation does not wait on SMTP. Failures retry with backoff. Worker leases prevent simultaneous workers from normally sending the same job and recover abandoned jobs after five minutes. A crash after SMTP accepts mail but before the database update can produce a duplicate email; SMTP delivery is at least once, not exactly once.

Development defaults to the **console** email backend: messages print in the worker terminal. For real delivery set:

```powershell
$env:EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
$env:EMAIL_HOST = "your-smtp-host"
$env:EMAIL_PORT = "587"
$env:EMAIL_HOST_USER = "your-smtp-user"
$env:EMAIL_HOST_PASSWORD = "your-smtp-password"
$env:EMAIL_USE_TLS = "1"
$env:DEFAULT_FROM_EMAIL = "Rim & Rally <your-verified-sender@example.com>"
```

## Verification

```powershell
$env:DJANGO_DEBUG = "1"
$env:PAYMENTS_TEST_DB_PATH = Join-Path (Get-Location) ".payments-test.sqlite3"
.\.venv\Scripts\python.exe manage.py test payments --noinput
.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
.\.venv\Scripts\python.exe manage.py check
```

`PAYMENTS_TEST_DB_PATH` must identify a **disposable test file**, never a real database: the test runner creates and removes it. The file-based test database is needed for the two concurrent-customer allocation tests; the default in-memory database skips those tests. Coverage includes price/destination snapshots, access controls, CSRF, malformed receipts, receipt/reference reuse, expiry/rebooking, capacity races, staff verification, and email recovery.

Manual acceptance: create a customer → reserve → scan the real owner's QR in a test environment → upload a test receipt → check pending → review as staff → confirm → run worker → check email and customer status. Also let an unpaid booking expire and verify another customer can reserve it. No real transfer, live SMTP delivery, or production deployment was performed when preparing this package.

## Deployment notes

The included database is **persistent SQLite**, configured with `BEGIN IMMEDIATE` so reservation writes serialize. It needs a persistent local volume and a single application host; do not put the database on an ephemeral serverless filesystem or a shared network drive. Receipts and QR snapshots are private database BLOBs, validated and re-encoded as PNG, limited to 5 MB. Back up and restrict access to the database. This initial implementation is suitable for a small single-host deployment; high write throughput or multiple hosts require a database/storage migration and renewed concurrency testing. Do not simply switch database engines and assume SQLite's locking policy carries over. Django documents SQLite transaction behavior in its [database reference](https://docs.djangoproject.com/en/dev/ref/databases/).

For deployment, set `DJANGO_DEBUG=0`, a strong persistent `DJANGO_SECRET_KEY`, allowed hosts, HTTPS, a production WSGI server, SMTP, static hosting (`manage.py collectstatic`), scheduled jobs, database backups and a receipt retention policy. Configure login/signup and reservation rate limiting at the trusted reverse proxy. The bundled settings do not trust forwarded IP or protocol headers; configure trusted proxy handling explicitly if TLS terminates upstream. HTTPS redirect and secure cookies are enabled outside development.

The existing Next.js booking checkout remains a **mock** until explicitly connected. Follow `docs/PAYMENTS-INTEGRATION.md`; setting `NEXT_PUBLIC_API_MODE=http` by itself is not an integration for this new manual-payment protocol.
