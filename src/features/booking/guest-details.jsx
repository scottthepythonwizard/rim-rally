"use client";

import { useRef } from "react";
import { normalizeMobile } from "./hold-state";

export default function GuestDetails({ flow }) {
  const form = useRef(null);
  async function submit(event) {
    event.preventDefault();
    const valid = await flow.reviewGuest();
    if (!valid) requestAnimationFrame(() => form.current?.querySelector('[aria-invalid="true"]')?.focus());
  }
  const fields = [
    { name: "name", label: "Full name", type: "text", autoComplete: "name", maxLength: 120 },
    { name: "email", label: "Email address", type: "email", autoComplete: "email", maxLength: 254 },
    { name: "mobile", label: "Philippine mobile number", type: "tel", autoComplete: "tel", maxLength: 24 },
  ];
  return <section aria-labelledby="guest-title" className="rounded-xl border border-ink/20 bg-paper p-6 md:p-8">
    <p className="text-[10px] tracking-widest uppercase">Step 2 / Guest details</p><h2 id="guest-title" className="mt-3 font-editorial text-2xl">Who’s coming to play?</h2>
    <p className="mt-4 text-xs leading-6 text-ink/70">Your time stays on hold while you complete this form. Details stay in this page’s memory; refreshing clears the form.</p>
    <form ref={form} noValidate onSubmit={submit} className="mt-6 space-y-5">
      {fields.map((field) => <div key={field.name}><label htmlFor={`guest-${field.name}`} className="mb-2 block text-xs font-medium">{field.label} <span aria-hidden="true">*</span></label><input id={`guest-${field.name}`} name={field.name} type={field.type} autoComplete={field.autoComplete} maxLength={field.maxLength} required value={flow.guest[field.name]} onChange={(event) => { flow.setGuest({ ...flow.guest, [field.name]: event.target.value }); flow.setFieldErrors({ ...flow.fieldErrors, [field.name]: undefined }); }} aria-invalid={Boolean(flow.fieldErrors[field.name])} aria-describedby={flow.fieldErrors[field.name] ? `guest-${field.name}-error` : field.name === "mobile" ? "mobile-hint" : undefined} className="min-h-12 w-full rounded-lg border border-ink/30 bg-white/40 px-4 text-sm aria-invalid:border-ink aria-invalid:ring-1 aria-invalid:ring-ink" />{flow.fieldErrors[field.name] && <p id={`guest-${field.name}-error`} className="mt-2 text-xs font-medium">{flow.fieldErrors[field.name]}</p>}</div>)}
      <p id="mobile-hint" className="text-[11px] text-ink/70">Use 09171234567 or +639171234567.</p>
      <div className="flex flex-wrap items-center gap-3"><button type="submit" disabled={!flow.canContinue || flow.busy} className="min-h-11 rounded-full bg-ink px-6 font-editorial text-xs text-paper disabled:cursor-not-allowed disabled:opacity-40">Review reservation</button><button type="button" onClick={() => flow.back("selection")} className="min-h-11 px-3 text-xs underline underline-offset-4">Back to schedule</button></div>
    </form>
  </section>;
}

export function GuestReview({ flow }) {
  return <section aria-labelledby="review-title" className="rounded-xl border border-ink/20 bg-paper p-6 md:p-8">
    <p className="text-[10px] tracking-widest uppercase">Step 3 / Review</p><h2 id="review-title" className="mt-3 font-editorial text-2xl">Your game is taking shape.</h2>
    <dl className="mt-6 divide-y divide-ink/15 text-sm"><div className="py-4"><dt className="text-[10px] tracking-widest uppercase">Guest</dt><dd className="mt-2 break-words">{flow.guest.name.trim()}</dd></div><div className="py-4"><dt className="text-[10px] tracking-widest uppercase">Email</dt><dd className="mt-2 break-all">{flow.guest.email.trim()}</dd></div><div className="py-4"><dt className="text-[10px] tracking-widest uppercase">Mobile</dt><dd className="mt-2">{normalizeMobile(flow.guest.mobile)}</dd></div></dl>
    <div role="status" className="mt-6 rounded-lg border border-ink/20 bg-tan/40 p-4 text-xs leading-7">Your guest details are ready. Payment is not available in this preview. Your reservation is not confirmed, and your temporary hold still expires at its original deadline.</div>
    <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => flow.back("details")} className="min-h-11 rounded-full border border-ink px-5 text-xs">Edit guest details</button><button type="button" onClick={() => flow.back("selection")} className="min-h-11 px-3 text-xs underline underline-offset-4">Back to schedule</button></div>
  </section>;
}
