# Staff and admin access

Use Node.js 24 and run the existing Next.js app on a server with a persistent private disk. Staff accounts, sessions, invitations and managed Open Play schedules live in SQLite. The app creates the database on first use. Set these variables in `.env.local` for local use or in the server environment for hosting.

- `STAFF_APP_ORIGIN` is the exact site origin recipients will open. It defaults to `http://127.0.0.1:3000`. Use the site's HTTPS origin on a remote host.
- `STAFF_DB_PATH` defaults to `.rim-rally/staff.sqlite`. On a hosted server use a persistent path outside the served assets and source tree. Give only the app's service account access to the database and its directory. The bootstrap command and the web process must use the same path.

## First admin

From the app folder, run `npm run staff:bootstrap -- admin@example.com` with the first admin's actual email. Open the printed invitation privately and choose a password. The invitation expires in 24 hours and is consumed when the account is created. Running the command again before setup completes replaces the old bootstrap link. Once an account exists, the bootstrap command is closed. No default account or password is shipped.

## Daily use

Use **Log in** in the navbar. Both roles can create, view, edit, cancel and delete managed schedules. A cancellation keeps the schedule in the dashboard as **Canceled**. Deletion is a separate action with a confirmation prompt.

Admins have an **Accounts** page where they can generate or revoke invitations, choose the invitee's role, and change another account's role or access. Share the invitation link privately with the intended recipient. The app binds it to the invited email and chosen role. Account role/access changes revoke that account's active sessions. An admin needs another admin to change their own access.

The dashboard uses a separate server-backed schedule store. The existing guest Open Play page and its booking flow still use the configured mock or HTTP scheduling adapter. Connecting managed schedules to live guest availability and bookings requires the booking backend to use the same schedule source and enforce holds, capacity and cancellations there.

## Verify

Run `npm run lint`, `npm test` and `npm run build`. Run `npm run test:staff` after the production build. It uses a separate loopback server and temporary SQLite database. It exercises initial admin setup, staff/admin invites, sign-in and sign-out, schedule operations, permission checks on pages, and attempts to invoke server actions directly with unauthorized sessions.
