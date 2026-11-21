import Link from "next/link";
import { Eyebrow } from "@/components/ui/primitives";
import { requireStaff } from "@/server/staff-session";
import { signOut } from "@/features/staff/actions";
import { STAFF_API_AVAILABLE } from "@/config/backend";
import { UnavailableNotice } from "@/components/ui/backend-unavailable";

export const metadata = { title: "Staff dashboard", robots: { index: false, follow: false } };
export default async function DashboardLayout({ children }) {
  const actor = await requireStaff();
  return <main id="main" className="mx-auto min-h-[60vh] max-w-6xl px-5 py-12">
    <Eyebrow>Staff dashboard</Eyebrow>
    <p className="mt-2 break-words text-sm">{actor ? <>{actor.email} <span className="capitalize">· {actor.role}</span></> : "Staff access is temporarily unavailable."}</p>
    <nav aria-label="Staff dashboard" className="my-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-ink/20 pb-3 text-sm">
      <Link className="py-2 underline underline-offset-4" href="/dashboard">Open Play schedules</Link>
      {[['bookings', 'Bookings'], ['customers', 'Customers'], ['payments', 'Payments'], ['cancellations', 'Cancellations'], ['walk-in', 'Add walk-in']].map(([path, label]) => <Link key={path} className="py-2 underline underline-offset-4" href={`/dashboard/${path}`}>{label}</Link>)}
      <Link className="py-2 underline underline-offset-4" href="/dashboard/sessions">Sessions</Link>
      {(!STAFF_API_AVAILABLE || actor?.role === "admin") && <Link className="py-2 underline underline-offset-4" href="/dashboard/accounts">Accounts</Link>}
      <form action={signOut}><button disabled={!STAFF_API_AVAILABLE} className="min-h-11 underline underline-offset-4 disabled:opacity-50">Sign out</button></form>
    </nav>
    {!STAFF_API_AVAILABLE && <UnavailableNotice />}
    <fieldset disabled={!STAFF_API_AVAILABLE} className="min-w-0">{children}</fieldset>
  </main>;
}
