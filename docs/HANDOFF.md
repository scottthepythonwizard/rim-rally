# Rim & Rally frontend handoff

Updated November 3, 2026 · Asia/Manila. Presentation tier only.

## Start here

The active application is C:/Users/user/Desktop/my-app. The repository is https://github.com/scottthepythonwizard/rim-rally. Phase 4 was pushed as 547321a with message `payment section added`. Phase 5 verification and handoff are complete locally after that commit: 61 unit/component tests and 35 production-browser tests pass, along with lint and build. See PHASE-5-VERIFICATION.md for evidence.

Use Node.js 20.9 or newer and npm. From the repository folder run npm ci, then npm run dev, and open http://127.0.0.1:3000. Use npm run build followed by npm start to rehearse the production build. Do not run development and production servers on the same port simultaneously.

Default mode needs no backend or merchant account. For tests, install Chromium once with npx playwright install chromium. Run npm test, npm run test:e2e, npm run lint and npm run build. Playwright reuses the server at port 3000 or starts one; use PLAYWRIGHT_BASE_URL to target another running instance.

Do not commit .env.local or provider secrets. .env.example documents the two public settings. NEXT_PUBLIC_API_MODE=mock is the supported independent demonstration. HTTP mode requires a dedicated backend, agreed contracts and NEXT_PUBLIC_API_BASE_URL; restart Next after changing environment values. Facility discovery remains mock-backed. Switching to HTTP alone does not establish a real payment integration.

## Backend team reading order

1. API-CONTRACT.md: scheduling reads, hourly window, Manila timestamps and centavo amounts.
2. HOLD-API-CONTRACT.md: authoritative allocation, revisions, original ten-minute deadline, recovery credentials and idempotency.
3. PAYMENT-API-CONTRACT.md: payment operations, lookup by original key after lost acknowledgement, pending allocation, receipt payload and opaque ticket tokens.
4. ARCHITECTURE.md: source boundaries and state ownership.

Before live integration agree on HTTPS/CORS and allowed headers; guest credential issuance/transport; authoritative availability/prices/capacity; atomic hold updates; pending-payment allocation past expiry; idempotency retention and key lookup; payment-provider approval and webhooks; cancellation/refund policy; receipt courtName/guestName/context; and server ticket verification. Do not implement these policies in UI components or add a Next.js business API/database layer.

Backend must reject stale revision/expectedAmount before initiating a payment. A successful payment with booking allocation pending does not permit a pass. References, elapsed timers and user clicks never prove payment success. Court IDs are opaque; supply courtName rather than relying on ID naming conventions.

## Demonstration rehearsal

1. Start on the home page: verify corrected navigation, hero copy, gray court/membership sections, tan location and black footer. Photography remains placeholders until the user authorizes real assets.
2. Open Book a court, choose either sport and a future Manila date. Basketball has one half-court. Both sports cost PHP 400 per court-hour. Three pickleball courts and Open Play prices/capacities remain demo fixtures.
3. Select adjacent hours: the service acknowledges a ten-minute hold. Add another adjacent hour and show that expiry does not restart. Use a second same-origin tab to demonstrate conflicting holds.
4. Enter fictitious guest details. Select GCash/Maya (09… or +639… mobile) or QRPh (explicit demo QR and a 6–40 character reference).
5. Choose Success in Demo payment outcome. The service confirms the booking before showing the receipt and unique token QR. Print / Save as PDF becomes available after QR generation.
6. Repeat with Failed, then retry or cancel. Demonstrate Uncertain then recovered, Paid allocation pending, or Malformed result then recovered; no premature pass or duplicate payment is created.
7. Use Delayed over two minutes for the delayed-status notice, and reload an uncertain payment to recover the same attempt. Normal timer expiry during processing does not determine the payment outcome.
8. Show one-place Open Play booking and capacity. Availability scenarios provide fully booked, empty, failed, slow and malformed read states.

No real money is collected and demo passes are not valid for entry. Guest contact and payment inputs remain memory-only. The initial pass contains the guest name; a full reload recovers the demo booking but clears that name explicitly. The production API must return guestName. Only the latest opaque payment recovery record is retained; booking history/accounts are excluded.

## Final delivery dependencies

- Original approved logo and photography remain outstanding; preserve placeholders until requested. Location map linking is intentionally deferred.
- Confirm amenities, contact channels, Open Play rates/capacities and the three-court pickleball fixture. The user already supplied the address, membership copy, one basketball half-court and PHP 400 hourly court prices.
- Test real target phones, mobile wallet handoff and native print dialogs during live-provider/device acceptance. Automated Chromium checks do not establish Safari/Firefox or assistive-technology certification.
- Login, membership purchase, staff tools and newsletters remain outside the guest frontend scope. Their controls explain availability.
- Phase 6 frontend delivery is recorded in FINAL-DELIVERY.md, using the restored design. The final November 29 buffer remains available for defects, device acceptance and approved assets before November 30.

## WHAT COULD I BE WRONG ABOUT?

Suspended tabs, clock changes and delayed responses can outlive a visual deadline. Service revalidation and payment reconciliation remain authoritative; browser mocks share the device clock and cannot prove real cross-user guarantees.

Backend response formats and provider behavior can differ from these proposed contracts. Validate payloads, keep uncertain writes attached to their original keys, and run real integration tests before enabling live transfers. Automated accessibility checks supplement keyboard and device testing; they are not a complete accessibility audit.
