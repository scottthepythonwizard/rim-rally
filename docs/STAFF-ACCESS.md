# Staff and admin access

Staff authentication and operations are connected to the local Django host when
NEXT_PUBLIC_BACKEND_ENABLED=1. See [PAYMENT-INTEGRATION.md](PAYMENT-INTEGRATION.md)
for current environment, startup, tests and recovery. `/admin/` and `/payments/`
remain intact. With the flag unset/0, dependent frontend actions stay paused.

Use Node.js 24 for Next.js and the configured Django backend for all stored staff accounts, sessions, invitations and schedules. SQLite is for separate local demonstrations only; use your team's DATABASE_URL for the final backend.

- `STAFF_APP_ORIGIN` is the exact site origin recipients will open. It defaults to `http://127.0.0.1:3000`. Use the site's HTTPS origin on a remote host.
- `DJANGO_API_BASE_URL` is the private Django API address used by Next.js. The bootstrap command must use the same Django environment/database as that backend. STAFF_DB_PATH belongs to the retired Node implementation.

## First admin

From the app folder, run `npm run staff:bootstrap -- admin@example.com` with the first admin's actual email. Open the printed invitation privately and choose a password. The invitation expires in 24 hours and is consumed when the account is created. Running the command again before setup completes replaces the old bootstrap link. Once an account exists, the bootstrap command is closed. No default account or password is shipped.

## Daily use

Use **Log in** in the navbar. Both roles can create, view, edit, cancel and delete managed schedules. A cancellation keeps the schedule in the dashboard as **Canceled**. Deletion is a separate action with a confirmation prompt.

Admins have an **Accounts** page where they can generate or revoke invitations, choose the invitee's role, and change another account's role or access. Share the invitation link privately with the intended recipient. The app binds it to the invited email and chosen role. Account role/access changes revoke that account's active sessions. An admin needs another admin to change their own access.

The default booking mode now uses the same server database for guest checkout, staff bookings and managed schedules. Set `NEXT_PUBLIC_API_MODE=server` and `NEXT_PUBLIC_API_BASE_URL=/api` when configuring the app. Leave both unset for these defaults. `mock` remains available for demo tests; `http` selects an external backend that must implement the same contracts. Rebuild after changing these public settings.

See [ADMIN-WORKFLOWS.md](ADMIN-WORKFLOWS.md) for booking management, proof review, cancellation/refund tracking, walk-ins, storage and verification.

## Verify

Run the checks and enabled-build commands in PAYMENT-INTEGRATION.md. The integration Playwright configuration creates a fresh temporary database and tests guest/staff payment workflows. Older paused-mode browser suites require a paused build; they are not the enabled integration acceptance test.
