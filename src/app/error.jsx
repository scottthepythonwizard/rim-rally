"use client";
import { buttonClass } from "@/components/ui";

export default function ErrorPage({ reset }) {
  return <main id="main" className="mx-auto min-h-[60vh] max-w-3xl px-6 py-24"><p className="text-xs tracking-widest uppercase">A pause in play</p><h1 className="mt-5 text-4xl font-bold">We couldn’t load this page.</h1><p className="mt-5 text-sm leading-7">Please try again. If the issue continues, come back in a moment.</p><button onClick={reset} className={`${buttonClass} mt-8 bg-ink text-white`}>Try again</button></main>;
}
