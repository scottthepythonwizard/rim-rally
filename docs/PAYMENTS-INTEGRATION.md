# Frontend integration — manual payment backend

## Working entry points

- Customer browsing and reservation: `/payments/book/`
- Customer registration/login: `/payments/signup/`, `/payments/login/`
- Customer booking list: `/payments/mine/`
- QR instructions, receipt upload and status: `/payments/<booking UUID>/`
- Staff payment review: `/admin/payments/booking/`

The included server-rendered pages implement the full backend flow without changes to the Next.js checkout components. The simplest frontend connection is to link **Book / Proceed to book** to `/payments/book/`. If retaining the existing Next.js selection and layout, use the endpoints below and build a receipt-upload/pending-verification UI. Existing `payment-operations.js`, guest hold mocks, payment result validators and confirmed pass components expect a different automated-payment protocol and must not be used to interpret these responses.

Do not enable the old HTTP adapters globally: this module does not implement the old `/api/holds`, `/api/payment-attempts`, or signed digital-pass contract. Customer email is taken from the authenticated Django session. Guest recovery headers do not authorize payment requests.

## Sessions and CSRF

Serve the Next.js UI and Django payment endpoints under the **same origin**, using the existing Django bridge or a trusted reverse proxy. No cross-origin CORS or bearer-token auth is supplied. Cookie sessions are HTTP-only. All mutation requests require the normal Django CSRF token and same-origin session cookies.

`GET /payments/session/` returns `{ "authenticated": true|false, "csrfToken": "..." }` and sets the CSRF cookie. Obtain a fresh token after login. For fetch requests use `credentials: "same-origin"` and `X-CSRFToken: <token>`. The examples below assume an authenticated customer; use the supplied login/signup pages for authentication.

## Create a reservation

`POST /payments/book/`

Body is **URL-encoded form data**, not JSON:

- `court_id`: Django court primary key, listed by the public form. These are not the mock fixture IDs.
- `request_key`: newly generated UUID, reused unchanged when retrying the same selection.
- Court rental: `date` (`YYYY-MM-DD`), `start_hour` (`8`–`23`), `hours` (`1`–`16`, ends no later than midnight).
- Open Play: `session_id` (Django PlaySession primary key); the backend derives the court times and price. `court_id` must match the selected session. Leave court-rental fields blank.

Send `Accept: application/json` for a JSON response. The server checks availability, computes the total and acquires the hold atomically. Amount/currency/recipient/status fields sent by a client are never used to price or confirm a booking. A request-key replay returns the original reservation, including its terminal status, and does not extend the deadline. A changed selection requires a fresh request key.

Success (`201`):

```json
{
  "id": "booking UUID",
  "status": "awaiting_payment",
  "amount": 40000,
  "currency": "PHP",
  "court": "Basketball Half-Court",
  "type": "court",
  "startsAt": "2030-01-01T10:00:00+08:00",
  "endsAt": "2030-01-01T11:00:00+08:00",
  "expiresAt": "ISO timestamp",
  "serverNow": "ISO timestamp",
  "paymentUrl": "/payments/booking-uuid/",
  "receiptSubmitted": false
}
```

Timestamps include an offset and may be serialized as UTC. Render dates in Asia/Manila. Money is integer PHP centavos. Navigate to `paymentUrl` to display the included QR/payment page.

Unauthenticated reservation: `401` JSON with `LOGIN_REQUIRED` and `loginUrl`. Invalid or conflicting selection: `409` with `error.code=RESERVATION_REJECTED` and Django field error arrays. Missing/invalid CSRF: `403` (Django's standard response). Form-driven requests redirect or re-render validation errors instead of returning JSON. Do not blindly retry conflicts with a new key.

Example frontend request:

```javascript
const session = await fetch('/payments/session/', {
  credentials: 'same-origin'
}).then(r => r.json());
// If not authenticated, navigate to /payments/login/?next=/payments/book/.
const response = await fetch('/payments/book/', {
  method: 'POST',
  credentials: 'same-origin',
  headers: { Accept: 'application/json', 'X-CSRFToken': session.csrfToken },
  body: new URLSearchParams({
    court_id: '1', date: '2030-01-01', start_hour: '10', hours: '1',
    request_key: crypto.randomUUID() // Retain this key until this operation resolves.
  })
});
const result = await response.json();
if (response.ok) window.location.assign(result.paymentUrl);
// Render result.error on failure. Do not navigate on a non-2xx response.
```

Replace the illustrative court/date with actual inventory and a future date within 180 days. The public Django booking page supplies valid court/session choices; no live scheduling API matching the old Next.js matrix is included in this payment-scoped package. Integrate the actual inventory/availability source before retaining that matrix for real reservations. Reservations always recheck availability, so a stale selection cannot acquire an occupied slot.

## Receipt upload and status

`GET /payments/<id>/` with `Accept: application/json` returns the current booking representation. Only the customer who owns the booking can access it. A customer can also list their latest 100 bookings with `GET /payments/mine/` and the same Accept header. Status responses use `Cache-Control: no-store`.

`GET /payments/<id>/qr/` returns the booking's saved owner QR as private PNG. `GET /payments/<id>/receipt/` returns the submitted proof to its owner or authorized payment staff. These URLs require cookies; never publish or copy the image into public assets.

`POST /payments/<id>/` with **multipart/form-data** uploads `proof` (PNG/JPEG image, maximum 5 MB) and `reference` (wallet/bank transaction reference, maximum 120 characters). Send the CSRF header and `Accept: application/json`. Let the browser set the multipart Content-Type boundary. Successful upload returns the booking with `status=pending_verification`. The same image/reference replay is idempotent; a replacement upload or an image reused on another booking is rejected. Re-encoding or modifying an image can defeat hash deduplication; actual account verification remains mandatory.

Poll the booking GET endpoint while awaiting review (for example, every 15 seconds while the page is visible). Only show **Confirmed** when the server returns `status=confirmed`. A countdown ending or a receipt upload is never confirmation. The built-in HTML status page requires refresh; it does not poll automatically.

`POST /payments/<id>/cancel/` cancels only unpaid bookings. It redirects to the booking page. Receipted, expired or confirmed payments require staff assistance.

## State and slot policy

`awaiting_payment` → `pending_verification` → `confirmed` or `rejected`.

`awaiting_payment` can also become `cancelled` or `expired`. `pending_verification` can become `expired`. There is no automatic payment-success webhook and no customer-controlled confirmation endpoint. Confirmed bookings do not expire. Rejected/cancelled/expired bookings release allocation.

Each live court rental occupies its court interval exclusively. Open Play occupies one seat in a published session, up to capacity; it cannot overlap a court rental. The 10-minute unpaid deadline is replaced by a 24-hour review deadline after proof submission, capped at session start. The signed-in account may have at most three unpaid/pending bookings at once.

The Django payment store is the source of truth for this flow. The existing Next.js staff schedules are separate and are not automatically imported as PlaySession records; staff must manage payment inventory in Django until the team unifies those stores.
