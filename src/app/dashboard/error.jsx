"use client";

export default function DashboardError({ reset }) {
  return <section className="rounded-xl border border-ink/25 p-6">
    <h1 className="font-editorial text-2xl">We couldn’t load this page</h1>
    <p role="alert" className="mt-4 text-sm">Try again to reload the latest information.</p>
    <button type="button" onClick={reset} className="mt-5 min-h-11 rounded-full bg-ink px-6 text-sm text-paper">Try again</button>
  </section>;
}
