# Complete payment and staff API handoff

This folder bundles the two Django apps needed for the Rim & Rally frontend
connection. It is a handoff package, not a standalone Django project.

## Contents

- `payments/`: payment models, migrations, services, REST handlers, private proof
  handling, management commands, templates and tests.
- `staff_api/`: frontend-compatible booking/hold endpoints, guest ownership,
  staff authentication, schedules, walk-ins, reviews and cancellation/refund records.
- `requirements.txt`: dependency versions from the working local host. Merge with
  the team's dependencies rather than replacing them without review.
- `.env.django.example`: safe configuration examples, not actual credentials.
- `host-reference/settings.py` and `host-reference/urls.py`: reference configuration
  from the tested host. Merge the needed settings/routes into the existing backend;
  do not replace the team's Django project with these files.
- `docs/PAYMENT-INTEGRATION.md`: original integration, policy and verification notes.
- `MANIFEST.json`: checksums for the copied implementation and reference files.

## Add to the team's backend

1. Create a review branch. If `payments` or `staff_api` already exists, compare and
   merge it; do not overwrite its models or migration history.
2. Place the two app directories alongside the backend's other Django apps.
   The outer handoff folder does not belong in INSTALLED_APPS.
3. Merge dependencies and add `rest_framework`, `payments` and `staff_api` to the
   host's installed apps. Adapt host-reference imports to the existing project name.
4. Review authentication, permissions, database settings, session/CSRF cookie names,
   trusted frontend origin and PAYMENT_ALLOCATION_GUARD. Preserve the team's account
   model and use one shared court/session/booking inventory.
5. Merge URL registrations into the existing URL configuration. The Next.js
   frontend expects the compatibility routes under `/api/`, including `/api/auth/`
   and `/api/staff/`. Keep existing unrelated backend routes.
6. Review migrations against the team's existing schema and test on a disposable
   database first. Back up shared data before applying approved changes. Then run
   Django checks and `python manage.py test payments staff_api` in that host.
7. Configure real inventory/payment instructions and required email/expiry jobs.
   Keep development fixtures and their test accounts out of production.

Some tests and historical documentation refer to files in the original my-app
repository. Adapt those host-specific references when moving this package; this
bundle alone does not reproduce the original full-project/browser test environment.

No production database, uploaded customer files, virtual environment, secrets or
cache files are included. Refund/cash actions record staff decisions and external
transactions; this package does not automatically transfer money.

For GitHub, copy the contents into a review branch of the backend repository and
integrate there. Merely uploading this wrapper folder will not register Django apps
or make the frontend connection work. Nothing has been pushed by creating this copy.
