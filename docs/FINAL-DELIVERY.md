# Final frontend delivery — Phase 6

November 3, 2026 · Asia/Manila · frontend-demo-2026-11-03

## Delivery status

The guest frontend is ready for a local mock demonstration and backend handoff. Phase 6 preserves the restored UI selected by the user. No visual refinement, new booking feature, real payment integration or deployment is included in this phase.

The runnable source is C:/Users/user/Desktop/my-app. The final code includes local Phase 5 fixes after GitHub commit 547321a (payment section added). This document does not imply those local changes have been committed or pushed.

## Run and rehearse

1. From the app folder, run npm ci on a fresh checkout.
2. For development, run npm run dev and open http://127.0.0.1:3000.
3. For production rehearsal, run npm run build followed by npm run start -- --port 3010 and open http://127.0.0.1:3010. That port avoids a development server already using 3000.
4. Default mock mode needs no backend or merchant account. Copy .env.example only when configuring an agreed backend; do not place secrets in public environment variables.
5. Follow the complete demo sequence in HANDOFF.md: both sports, consecutive hours, unchanged hold deadline, guest details, all three methods, failed retry/cancel, uncertain recovery, Open Play capacity and the printable pass.
6. Use fictitious contact details. For a named demo pass, print/save before refreshing: contact details stay memory-only, so reload recovers the booking but clears the mock guest name.

## Checked release files

- Source and public assets: src/ and public/.
- Reproducible dependencies: package.json and package-lock.json. npm ls --depth=0 succeeds.
- Configuration: Next.js, Tailwind/PostCSS, lint, Vitest and Playwright configs, .env.example and .gitignore.
- Setup/demo guide: README.md and HANDOFF.md.
- Backend contracts: API-CONTRACT.md, HOLD-API-CONTRACT.md and PAYMENT-API-CONTRACT.md.
- Assets and architecture: ASSETS.md and ARCHITECTURE.md.
- Verification evidence: PHASE-5-VERIFICATION.md, test suites and existing milestone screenshots.
- Baseline fingerprint: DELIVERY-MANIFEST.json records SHA-256 hashes for source/assets/tests/config. It intentionally excludes node_modules, .next, .git, private environment files and generated test artifacts. Any later source change requires another verification pass and refreshed manifest.

## Final acceptance checklist

- [x] Current restored design preserved; rejected polish is not reintroduced.
- [x] Lint, unit/component suite and production build pass.
- [x] Dependency consistency check passes.
- [x] Complete guest-flow suite rehearsed against a fresh production server.
- [x] Both sports, private bookings and one-place Open Play covered.
- [x] Hold expiry, competing tabs, unchanged expiry after edits and recovery covered.
- [x] GCash, Maya and QRPh mock success/failure, retry/cancel, uncertain status and repeated submission covered.
- [x] QR pass requires confirmed service status; print media hides navigation/footer and retains the QR.
- [x] Automated accessibility and responsive checks cover 360/390/768/1024/1440px.
- [x] Setup, contracts, asset gaps, demo steps and limitations documented.
- [ ] Physical target phones, real screen readers and native print dialogs: device acceptance remains external to automated Chromium checks.
- [ ] Live backend/provider agreement, merchant setup, webhooks, cross-user allocation and ticket verification: separate integration readiness gates.
- [ ] Original branding/photos or map link: deferred until requested; placeholders remain intentional.

## Scope freeze and known limits

Preserve the current approved appearance, one basketball half-court, PHP 400/hour for both sports and all existing guest behavior. Login/accounts, membership purchases, staff dashboards and newsletter collection remain excluded. Backend/database/payment processing remain outside the presentation tier.

Browser mocks are same-origin simulations, not real multi-user protection. Production QRPh requires a provider-issued payable QR; provider cancellation/refunds require agreement. Guest IDs alone cannot authorize access. The mock receipt name clears on reload and only the latest recovery record is retained.

The release viewport checks begin at 360px as agreed in the roadmap. The 320px calendar refinement was reverted with the rejected polish; the earlier fixed-width calendar can clip on extra-narrow screens. No claim of new 320px support is made for the restored design.

No GitHub push, public deployment, real transfer, subscription or outbound message is performed by this delivery step. November 29 remains the final buffer/checkpoint before the November 30 deadline; use remaining time for defects and external acceptance rather than expanding scope.

## WHAT COULD I BE WRONG ABOUT?

Background tabs suspend timer updates and device clocks can change. Revalidate holds and reconcile payment status on return; only the dedicated backend can supply independent timing and actual cross-user allocation guarantees.

Unexpected backend errors or delayed writes can leave the outcome uncertain. Keep the original operation/recovery identifier, validate responses and reconcile before another attempt. Mock/Chromium results do not replace real backend, provider or physical-device acceptance.

## Final verification results

- npm run lint: pass.
- npm test: 61 unit/component tests pass.
- npm run build: pass, Next.js 16.4.3 production output.
- npm ls --depth=0: pass; no missing/invalid top-level dependencies reported.
- npm run test:e2e against http://127.0.0.1:3010 (fresh npm start production instance): all 35 tests pass in 1.4 minutes.
- git diff --check: pass.
- DELIVERY-MANIFEST.json: all 87 source/asset/test/config file hashes verified after rehearsal.

No application source or styling was changed during Phase 6. Current code is ready for the agreed mock frontend demo and handoff; unchecked external acceptance gates above are not claimed as completed.
