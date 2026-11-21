import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireStaff } from "@/server/staff-session";
import { readCustomer } from "@/server/staff-data";
import { listSchedules, listCourts } from "@/server/staff-data";
import { manilaDate } from "@/features/booking/scheduling";
import WalkInForm from "@/features/staff/walk-in-form";

export default async function WalkInPage({ searchParams }) {
  await requireStaff();
  const query = await searchParams;
  const customer = query.customer ? await readCustomer(String(query.customer)) : null;
  const now = new Date().getTime();
  const schedules = (await listSchedules()).filter((s) => s.status === "active" && Date.parse(s.starts) > now);
  return <><h1 className="font-editorial text-3xl">Add walk-in booking</h1><p className="my-4 text-sm leading-6">Choose a <Link href="/dashboard/customers" className="underline">saved customer</Link> or enter their details. Matching email and mobile reuse the existing customer record.</p>
    <section className="rounded-xl border border-ink/20 p-5 text-sm"><WalkInForm customer={customer ? { ...customer } : null} schedules={schedules.map((s) => ({ ...s }))} courts={await listCourts()} date={manilaDate()} requestKey={randomUUID()} /></section></>;
}
