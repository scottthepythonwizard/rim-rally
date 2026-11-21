# Connect the separate Django backend

This repository contains no Django payment package, models, migrations or host.
Run and publish the backend from its separate repository. The current frontend
expects the compatibility endpoints used by src/services and src/server.

Merge these values into the frontend environment; rebuild after changing public flags:

```dotenv
NEXT_PUBLIC_BACKEND_ENABLED=1
NEXT_PUBLIC_API_MODE=server
NEXT_PUBLIC_API_BASE_URL=/api
DJANGO_API_BASE_URL=https://your-backend.example/api
STAFF_APP_ORIGIN=https://your-frontend.example
```

For local development the private backend URL may use localhost/127.0.0.1 HTTP.
Keep DJANGO_API_BASE_URL server-only. Do not put database credentials, signing
keys or payment secrets in NEXT_PUBLIC variables.

Browser guest requests use the frontend's same-origin /api proxy and a private
X-Guest-Recovery credential. Staff server actions use Django sessions and CSRF.
The backend must provide /auth/csrf, /auth/login, /auth/logout, /auth/join and the
/staff endpoints used by the current frontend; simply exposing the original
/payments REST catalogue is insufficient. Cookie names are rim_rally_staff and
rim_rally_csrf. Configure the backend to trust the exact STAFF_APP_ORIGIN for CSRF,
and use HTTPS, secure cookies and persistent database storage in production.

Backend payment and booking operations must preserve server-calculated prices,
shared availability, ownership, staff permissions, expiry and idempotency.
Proof upload uses PNG/JPEG plus a transaction reference. Financial confirmation
comes from authorized staff review, not client inputs or proof upload alone.

Without a configured backend, enabled pages may report service errors at runtime.
To pause those workflows set NEXT_PUBLIC_BACKEND_ENABLED=0 and rebuild.
