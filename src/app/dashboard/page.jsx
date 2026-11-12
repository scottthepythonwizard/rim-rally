import { requireStaff } from "@/server/staff-session";
import { db } from "@/server/staff-store.mjs";
import { formatDay, formatTime, manilaDate, money } from "@/features/booking/scheduling";
import { changeSchedule, saveSchedule } from "@/features/staff/actions";
import { ActionForm } from "@/features/staff/forms";
import { fieldClass, primaryClass, secondaryClass } from "@/features/staff/styles";

function Field({ label, children }) {
  return <label className="block min-w-0 space-y-1 text-sm"><span>{label}</span>{children}</label>;
}

function ScheduleForm({ schedule }) {
  return <ActionForm action={saveSchedule} className="mt-4">
    {schedule && <><input type="hidden" name="id" value={schedule.id} /><input type="hidden" name="version" value={schedule.version} /></>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Session title"><input className={fieldClass} name="name" defaultValue={schedule?.name} maxLength={100} required /></Field>
      <Field label="Sport"><select className={fieldClass} name="sport" defaultValue={schedule?.sport || "pickleball"}><option value="pickleball">Pickleball</option><option value="basketball">Basketball</option></select></Field>
      <Field label="Court"><input className={fieldClass} name="court" defaultValue={schedule?.court} maxLength={80} required /></Field>
      <Field label="Date"><input className={fieldClass} type="date" name="date" defaultValue={schedule?.starts.slice(0, 10) || manilaDate()} required /></Field>
      <Field label="Start time"><input className={fieldClass} type="time" name="start" defaultValue={schedule?.starts.slice(11, 16) || "08:00"} required /></Field>
      <Field label="End time"><input className={fieldClass} type="time" name="end" defaultValue={schedule?.ends.slice(11, 16) || "10:00"} required /></Field>
      <Field label="Capacity"><input className={fieldClass} type="number" name="capacity" min={1} max={9999} defaultValue={schedule?.capacity || 12} required /></Field>
      <Field label="Price per player (PHP)"><input className={fieldClass} type="number" name="price" min={0} max={999999.99} step="0.01" defaultValue={schedule ? (schedule.amount / 100).toFixed(2) : "200.00"} required /></Field>
    </div>
    <button className={primaryClass}>{schedule ? "Save changes" : "Create schedule"}</button>
  </ActionForm>;
}

function ScheduleAction({ schedule, operation, label, confirm }) {
  return <ActionForm action={changeSchedule} confirm={confirm}>
    <input type="hidden" name="id" value={schedule.id} />
    <input type="hidden" name="version" value={schedule.version} />
    <input type="hidden" name="operation" value={operation} />
    <button className={secondaryClass}>{label}</button>
  </ActionForm>;
}

export default async function DashboardPage() {
  await requireStaff();
  const schedules = db().prepare("SELECT * FROM schedules ORDER BY starts, id").all();
  return <>
    <h1 className="font-editorial text-3xl sm:text-4xl">Open Play schedules</h1>
    <p className="mt-3 text-sm">All times are in Asia/Manila. Use 12:00 AM as the end time for a session that ends at midnight.</p>
    <section className="mt-6 rounded-xl border border-ink/20 bg-tan/30 p-5">
      <h2 className="font-editorial text-xl">New schedule</h2>
      <ScheduleForm />
    </section>
    <section className="mt-8 space-y-4" aria-label="Saved schedules">
      {!schedules.length && <p className="text-sm">No schedules yet.</p>}
      {schedules.map((schedule) => <article key={schedule.id} className="rounded-xl border border-ink/20 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="min-w-0 break-words font-editorial text-xl">{schedule.name}</h2>
          <span className="rounded-full border border-ink/25 bg-tan px-3 py-1 text-xs font-semibold">{schedule.status === "canceled" ? "Canceled" : "Scheduled"}</span>
        </div>
        <p className="mt-2 break-words text-sm"><span className="capitalize">{schedule.sport}</span> · {schedule.court} · {formatDay(schedule.starts.slice(0, 10), true)} · {formatTime(schedule.starts)}–{formatTime(schedule.ends)} · {schedule.capacity} places · {money(schedule.amount)} per player</p>
        {schedule.status === "active" && <details className="mt-4"><summary className="min-h-11 py-2 text-sm underline">Edit schedule</summary><ScheduleForm key={schedule.version} schedule={schedule} /></details>}
        <div className="mt-4 flex flex-wrap gap-3">
          {schedule.status === "active" && <ScheduleAction schedule={schedule} operation="cancel" label="Cancel schedule" confirm="Cancel this Open Play schedule? It will no longer be available for editing." />}
          <ScheduleAction schedule={schedule} operation="delete" label="Delete schedule" confirm="Permanently delete this Open Play schedule?" />
        </div>
      </article>)}
    </section>
  </>;
}
