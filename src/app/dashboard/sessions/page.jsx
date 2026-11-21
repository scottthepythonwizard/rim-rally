import { STAFF_API_AVAILABLE } from "@/config/backend";
import Link from "next/link";
import { requireStaff } from "@/server/staff-session";
import { listSessions } from "@/server/staff-data";
import { formatDay, formatTime, manilaDate, validDate } from "@/features/booking/scheduling";
import { fieldClass, primaryClass, secondaryClass } from "@/features/staff/styles";

export const metadata = { title: "Sessions" };

export default async function SessionsPage({ searchParams }) {
  await requireStaff();
  const query = await searchParams;
  const timing = query.timing === "current" ? "current" : "upcoming";
  const date = validDate(query.date) ? query.date : "";
  const now = new Date().getTime();
  const sessions = await listSessions({ timing, date });

  return <>
    <h1 className="font-editorial text-3xl sm:text-4xl">Sessions</h1>
    <p className="mt-3 text-sm leading-6">Court bookings and Open Play for {formatDay(manilaDate(now), true)} and beyond. All times are in Asia/Manila.</p>
    <form method="get" className="my-6 flex flex-wrap items-end gap-4">
      <div className="text-sm"><label htmlFor="session-timing">Show</label><select id="session-timing" name="timing" defaultValue={timing} className={fieldClass}>
        <option value="upcoming">Upcoming sessions</option><option value="current">Happening now</option>
      </select></div>
      <label className="block text-sm">Date<input name="date" type="date" defaultValue={date} className={fieldClass} /></label>
      <button className={primaryClass}>Apply filters</button>
      <Link href="/dashboard/sessions" className={secondaryClass}>Reset filters</Link>
    </form>
    <div className="space-y-4" aria-label="Sessions">
      {STAFF_API_AVAILABLE && !sessions.length && <p role="status" className="rounded-xl border border-dashed border-ink/25 p-6">No {timing === "current" ? "sessions are happening now" : "upcoming sessions match these filters"}.</p>}
      {sessions.map((session) => <article key={session.id} className="rounded-xl border border-ink/20 p-5 [content-visibility:auto]">
        <h2 className="break-words font-editorial text-xl">{session.name}</h2>
        <p className="mt-2 text-sm capitalize">{session.type === "court" ? "Court booking" : "Open Play"} · {session.court}</p>
        <p className="mt-2 text-sm">{formatDay(session.starts.slice(0, 10), true)} · {formatTime(session.starts)}–{formatTime(session.ends)}</p>
        <p className="mt-2 text-sm">{session.type === "court" ? "1 booking" : `${session.registered} confirmed · ${session.held} reserved or held · ${session.remaining} places remaining of ${session.capacity}`}</p>
        <Link href={session.href} className="mt-3 inline-flex min-h-11 items-center text-sm underline underline-offset-4">View {session.type === "court" ? "booking" : "participants"}</Link>
        {session.type === "open-play" && <Link href={`/dashboard#schedule-${session.id}`} className="ml-5 inline-flex min-h-11 items-center text-sm underline underline-offset-4">Manage session</Link>}
      </article>)}
    </div>
  </>;
}
