import Link from "next/link";
import { Eyebrow } from "@/components/ui";
import { requireStaff } from "@/server/staff-session";
import { signOut } from "@/features/staff/actions";

export const metadata = { title: "Staff dashboard", robots: { index: false, follow: false } };
export default async function DashboardLayout({ children }) {
  const actor = await requireStaff();
  return <main id="main" className="mx-auto min-h-[60vh] max-w-6xl px-5 py-12">
    <Eyebrow>Staff dashboard</Eyebrow>
    <p className="mt-2 break-words text-sm">{actor.email} <span className="capitalize">· {actor.role}</span></p>
    <nav aria-label="Staff dashboard" className="my-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-ink/20 pb-3 text-sm">
      <Link className="py-2 underline underline-offset-4" href="/dashboard">Open Play schedules</Link>
      {actor.role === "admin" && <Link className="py-2 underline underline-offset-4" href="/dashboard/accounts">Accounts</Link>}
      <form action={signOut}><button className="min-h-11 underline underline-offset-4">Sign out</button></form>
    </nav>
    {children}
  </main>;
}
