import { UNAVAILABLE_MESSAGE } from "@/config/backend";

export function UnavailableNotice() {
  return <div role="status" className="my-5 rounded-xl border border-ink/20 bg-tan/30 p-5 text-sm leading-6">
    <p className="font-semibold">{UNAVAILABLE_MESSAGE}</p>
    <p>Backend integration is pending. Please try again later.</p>
  </div>;
}

export function UnavailableDetails({ title, sections = [] }) {
  return <><h1 className="font-editorial text-3xl sm:text-4xl">{title}</h1>
    <div className="mt-6 grid items-start gap-6 md:grid-cols-2">{sections.map((section, index) => <section key={section} className={`rounded-xl border border-ink/20 p-5 ${index > 1 ? "md:col-span-2" : ""}`}>
      <h2 className="font-editorial text-xl">{section}</h2><p className="mt-3 text-sm">{UNAVAILABLE_MESSAGE}</p>
    </section>)}</div>
  </>;
}
