# Run Rim & Rally through Django

Use Python 3.12–3.15 and Node.js 24. From the project folder in PowerShell, install the dependencies and build the shared styles and Next.js assets.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm ci
node scripts/build-django-styles.mjs
$env:NEXT_PUBLIC_API_MODE = "mock"
npm run build -- --webpack
```

In the same terminal, start Next.js on its internal port.

```powershell
$env:STAFF_APP_ORIGIN = "http://127.0.0.1:8000"
npm run start -- --port 3001
```

In a second terminal from the project folder, check and start Django.

```powershell
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Open [Rim & Rally](http://127.0.0.1:8000/). Re-run the style build when template utility classes or `src/app/globals.css` change. If port 3001 is in use, start Next.js on another port and set `RIM_RALLY_NEXT_PORT` to that port in the Django terminal. These commands run the local development site.

## Routes

- [Home](http://127.0.0.1:8000/), [About](http://127.0.0.1:8000/#about), and [Membership](http://127.0.0.1:8000/#membership)
- [Facility](http://127.0.0.1:8000/facilities/rim-and-rally)
- [Court booking](http://127.0.0.1:8000/book/rim-and-rally) and [Open Play](http://127.0.0.1:8000/book/rim-and-rally?mode=open-play)
- `/booking/<booking_id>/confirmation`, opened in the same tab after a simulated checkout
- [Staff login](http://127.0.0.1:8000/login) and `/join#<invitation_token>` from a complete invitation link
- [Staff dashboard](http://127.0.0.1:8000/dashboard) and [Admin accounts](http://127.0.0.1:8000/dashboard/accounts), available after signing in with the appropriate role

To bootstrap the first admin, run the following in another terminal with the same `STAFF_DB_PATH` as the Next.js process. Use your email address in place of the example.

```powershell
$env:STAFF_APP_ORIGIN = "http://127.0.0.1:8000"
npm run staff:bootstrap -- admin@example.com
```

## How requests are served

Django renders the landing, facility, and missing-page templates. The public templates use the shared facility fixture, fonts, logo, and Tailwind stylesheet. The mobile menu and notice dialogs use a small app script.

Django forwards the booking, confirmation, login, invitation, and dashboard routes to the local Next.js server. The same bridge forwards Next.js navigation payloads, server actions, and generated assets so hydration and staff sessions work on port 8000. Staff actions use the existing SQLite store and its role checks.

Guest holds and checkout use browser mocks. Live availability, booking allocation, and payment verification require the services described in the [scheduling](API-CONTRACT.md), [hold](HOLD-API-CONTRACT.md), and [payment](PAYMENT-API-CONTRACT.md) contracts. Staff-managed schedules have a separate store. Membership, contact, and newsletter buttons open informational dialogs.
