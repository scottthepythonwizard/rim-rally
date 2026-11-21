import { STAFF_API_AVAILABLE } from "@/config/backend";
import Link from "next/link";
import { requireStaff } from "@/server/staff-session";
import { listCustomers } from "@/server/staff-data";
import { fieldClass, primaryClass } from "@/features/staff/styles";

export default async function CustomersPage({ searchParams }) {
  await requireStaff();
  const { q = "" } = await searchParams;
  const customers = await listCustomers(q);
  return <><h1 className="font-editorial text-3xl">Customers</h1>
    <form className="my-6 flex flex-wrap items-end gap-3"><label className="text-sm">Search name, email or mobile<input name="q" maxLength={120} defaultValue={q} className={fieldClass} /></label><button className={primaryClass}>Search customers</button></form>
    <p className="mb-4 text-sm">Showing up to 100 matching customers. Use search to narrow the list.</p>
    {STAFF_API_AVAILABLE && !customers.length && <p role="status">No customers match your search.</p>}
    <ul className="space-y-3">{customers.map((c) => <li key={c.id} className="break-words rounded-xl border border-ink/20 p-5 [content-visibility:auto]"><Link href={`/dashboard/customers/${c.id}`} className="inline-flex min-h-11 items-center font-semibold underline">{c.name}</Link><p className="text-sm">{c.email} · {c.mobile}</p><p className="mt-2 text-sm">{c.bookings} booking(s)</p></li>)}</ul></>;
}
