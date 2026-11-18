# Files to add or replace

Upload these paths relative to the existing GitHub repository root. The ZIP already preserves this layout.

```text
rim-rally-main/
├── .env.payments.example                 ADD — reference environment values only
├── .gitignore                           CHANGE — keep payment databases/secrets out of Git
├── README.md                            CHANGE — links to the new backend
├── requirements.txt                     CHANGE — adds Pillow for image validation
├── PAYMENTS-FILE-MANIFEST.json           ADD — packaged file checksums and actions
├── rim_rally_site/                      ADD — missing Django project configuration
│   ├── __init__.py
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── payments/                            ADD — payment backend app
│   ├── __init__.py
│   ├── apps.py
│   ├── models.py                        Database and constraints
│   ├── services.py                      Reservation/payment/review transactions
│   ├── images.py                        Receipt and QR image validation
│   ├── forms.py                         Customer, reservation, upload, review forms
│   ├── views.py                         Customer pages and form/JSON endpoints
│   ├── urls.py
│   ├── admin.py                         Owner setup and staff verification
│   ├── tests.py                         22 automated tests
│   ├── migrations/
│   │   ├── __init__.py
│   │   ├── 0001_initial.py
│   │   └── 0002_email_delivery_leases.py
│   ├── management/
│   │   ├── __init__.py
│   │   └── commands/
│   │       ├── __init__.py
│   │       ├── seed_payment_courts.py
│   │       ├── expire_bookings.py
│   │       └── send_payment_emails.py
│   └── templates/
│       ├── payments/
│       │   ├── base.html
│       │   ├── form.html
│       │   ├── login.html
│       │   ├── book.html
│       │   ├── mine.html
│       │   └── detail.html
│       └── admin/payments/
│           └── review.html
├── views/
│   └── views.py                         CHANGE — preserve Next proxy POST compatibility
└── docs/
    ├── PAYMENTS-SETUP.md                 ADD — install, owner QR, staff, jobs, deployment
    ├── PAYMENTS-INTEGRATION.md           ADD — frontend protocol and remaining integration
    └── PAYMENTS-FILES.md                 ADD — this map
```

Do not upload `.venv/`, databases, uploaded receipts, `__pycache__/`, real `.env` files, or the ZIP itself to the source repository. The archive contains source and example configuration only. No GitHub push or deployment was made.

Verified in the prepared project: **22 tests pass**, including both file-database concurrency tests; `manage.py check` passes; `makemigrations --check --dry-run` reports no missing migrations. The original Next.js mock checkout was not changed or retested by this backend package. Real SMTP, QR scanning, bank transfers, and production hosting require acceptance testing after configuration.
