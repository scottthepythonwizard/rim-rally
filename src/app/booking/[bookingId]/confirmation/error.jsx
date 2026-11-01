"use client";
export default function Error({ reset }) { return <main id="main" className="p-12"><h1 className="text-2xl">We couldn’t display your pass.</h1><p className="mt-4">Your payment status has not changed. Try loading this pass again.</p><button onClick={reset} className="mt-5 min-h-11 rounded-full border px-6">Try again</button></main>; }
