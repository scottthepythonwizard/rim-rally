# Phase 4 foundation — November 1, 2026

Historical preparation notes. The user requested continuation; checkout is now implemented. See [current payment handoff](PAYMENT-API-CONTRACT.md) and ROADMAP.md.

Today's bounded milestone is preparation, not a completed checkout. Phases 1–3 remain intact.

## Implemented today

- GCash, Maya and QRPh method catalogue and an accessible method preview in guest review.
- Single-method radio selection; disabled if the hold is unverified. “Continue to payment” stays disabled in all cases.
- Payment response validator, reservation/amount/method matching and confirmation guard.
- Fixtures for pending, success, booking-pending, failure, cancellation and unknown status.
- Unit/component tests for the contract and preview.

No payment request, provider integration, reference submission, QR generation, booking confirmation or personal-data persistence occurs in this foundation. Existing hold expiry/cancellation/recovery still applies.

## Contract to agree with backend

POST /payment-attempts will accept holdId, method and guest contact details plus applicable mobile/reference inputs. Include the guest recovery credential and an idempotency key. Amount must come from the acknowledged hold quote, not a client-selected price. Backend revalidates the hold, quote and guest data.

GET /payment-attempts/:id will return id, holdId, method, currency=PHP, positive integer-centavo amount, status, bookingStatus, bookingId (when confirmed), and serverNow with an explicit timezone offset.

Payment status: pending, succeeded, failed, cancelled or unknown. Booking status: none, pending or confirmed. A succeeded payment with bookingStatus=pending must remain in reconciliation; it must not issue a booking pass. Only succeeded + confirmed + bookingId may proceed to the confirmation screen, followed by fetching the confirmed booking.

GET /bookings/:id must return the authoritative receipt, court/session details and opaque ticket token using a guest recovery credential. Hold/booking IDs alone are not authorization. QR payloads must not contain guest contact details.

Cancellation of a pending attempt needs a backend-approved endpoint and provider policy before implementation. Releasing a hold is not proof that a payment was cancelled. During pending/unknown payment status, the backend must reconcile money and allocation even if the normal hold deadline passes.

## Resume tomorrow — November 2 (Asia/Manila)

1. Read this file, docs/HOLD-API-CONTRACT.md, and current git status. Preserve all landing-page corrections and image placeholders.
2. Build the payment-attempt state controller and mock/HTTP adapters, binding each attempt to the acknowledged hold/amount. Retain one idempotency key per submission and reconcile uncertain writes before allowing another attempt.
3. Implement GCash/Maya mobile dialogs and the clearly labeled demonstration QRPh view/reference entry. Reference input is never proof of payment.
4. Connect the enabled checkout action only after fresh hold verification and valid guest details. Keep contact/payment inputs in memory, not browser storage.
5. Poll visible pending attempts every three seconds. After two minutes, show delayed-status recovery. Recheck on return/reconnect. Handle retry/cancel/unknown and expiry during processing without false success.
6. Fetch confirmed booking details, create the opaque-token QR ticket, and implement receipt + print/save-as-PDF.
7. Test all three methods, failures, retries, double clicks, unknown acknowledgements, reload recovery, hold expiry during payment and print output. Run tests, lint and build, then update the roadmap.

No automatic task/reminder is scheduled. Continue when the user returns and requests it. This file is the saved handoff.

## WHAT COULD I BE WRONG ABOUT?

- Payment-provider payloads and cancellation rules depend on backend/provider agreement; the contracts above are proposals, not evidence of a live integration.
- Background tabs and uncertain responses can outlive the original hold. Tomorrow's controller must reconcile service status instead of treating the displayed timer, a reference code or a user click as payment verification.
