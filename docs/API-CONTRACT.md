# Scheduling API handoff — Phase 2

The frontend is runnable with mocks. No backend endpoints or database access are implemented in Next.js. This contract is the frontend's proposal for the backend team to agree on before live integration.

## Setup and responsibilities

`NEXT_PUBLIC_API_MODE=mock` (default) uses local fixtures through the scheduling service. Set `NEXT_PUBLIC_API_MODE=http` and `NEXT_PUBLIC_API_BASE_URL=https://your-api.example/api` in an untracked `.env.local` to connect the scheduling views to live GET endpoints. Restart Next.js after environment changes. The browser calls the API directly, so the backend must allow the frontend origin via CORS. No credentials or secrets belong in these public variables.

Backend owns availability, court inventory, prices and peak rules, capacity, and later locking. Frontend owns selection and rendering. Displayed selection is not a reservation. Read-only public scheduling endpoints are assumed for Phase 2; agree on authentication before adding protected operations. Discovery remains the existing facility mock service and does not switch to HTTP yet.

## GET /availability

Query parameters: `facilityId=rim-and-rally`, `sport=pickleball|basketball`, `date=YYYY-MM-DD` interpreted in Asia/Manila.

Response fields:
- `facilityId`, `sport`, `date`: echo the requested context. Mismatched responses are rejected.
- `serverNow`: ISO timestamp with an explicit offset or Z.
- `courts`: array, empty if no court schedule is published.
- Each court: `id` (stable string), `name` (display label), `kind` (e.g. Indoor), `slots`.
- Each slot: `id` (stable unique string), `courtId`, `startAt`, `endAt`, `status`, `priceBand`, `amount`.
- `slots` contains exactly 16 ordered hourly entries, from 08:00 to next-day 00:00. Include unavailable entries so court columns align by time.
- `status`: `available`, `held`, or `booked`. `selected` is frontend state, never a server availability value.
- `priceBand`: `peak` or `off-peak`. Rates are supplied by the API, not calculated from frontend peak-hour rules.
- `amount`: nonnegative safe integer in PHP centavos. 40000 represents ₱400. Do not send formatted currency or decimal peso strings.

Example slot values: id `2030-01-01_pickleball-1_8`, courtId `pickleball-1`, startAt `2030-01-01T08:00:00+08:00`, endAt `2030-01-01T09:00:00+08:00`, status `available`, priceBand `off-peak`, amount `40000`.

The final slot must start at `2030-01-01T23:00:00+08:00` and end at `2030-01-02T00:00:00+08:00` for that date. Expired slots remain in the schedule but are disabled by frontend time comparison.

## GET /open-play

Same query parameters and envelope fields as availability, with `sessions` instead of `courts`.

Each session: `id`, `name`, `courtId`, `courtName`, `startAt`, `endAt`, `registeredCount`, `capacity`, `amount`, `priceBand`.

Counts are integers satisfying 0 ≤ registeredCount ≤ capacity and capacity > 0. `amount` is a per-player price in centavos. One guest selects one place in one session. The backend must revalidate remaining places when holds are introduced; a displayed remaining place is not a guarantee.

## Errors and resilience

Suggested error body: an `error` object with `code`, safe `message`, `fieldErrors`, `retryable`, and optional `requestId`. Use appropriate HTTP status, including 409 for conflict, 422 for invalid input, 429 for throttling, and 5xx for service failure.

The client normalizes malformed, non-JSON and unexpected responses to safe notices rather than exposing raw bodies or stack traces. Successful payloads are validated before rendering. Requests time out after 15 seconds. New selections cancel stale reads. Availability refreshes every 30 seconds while visible, and on focus/reconnection. Selections are cleared if they are no longer valid; refreshed prices replace stale amounts. An unsuccessful refresh disables selecting from stale data until retry succeeds.

## Mock scenarios and limitations

Use the collapsed “Demo availability scenarios” controls, or URL `scenario=normal|sold-out|empty|error|slow|malformed`.

Demo data includes three pickleball courts and one basketball half-court, available/held/booked examples, a nearly full Open Play session and a full session. The user confirmed one basketball half-court and a flat PHP 400 per court-hour for both sports, including peak and off-peak hours. All courts are indoor; the UI omits that repeated label. Availability, Open Play prices/capacities, peak windows and the three-court pickleball fixture remain illustrative. Replace fixtures with approved API data.

Simulated latency is 250ms or 2400ms for `slow`. `error` persists until changing scenario (a retry does not secretly change server conditions). `malformed` proves validation fallback. `empty` publishes no schedules. `sold-out` returns booked courts/full sessions.

Ten-minute holds, contact collection, checkout, payments, passes and cross-user concurrency guards remain Phase 3/4 work. No mutation API is called in Phase 2.
