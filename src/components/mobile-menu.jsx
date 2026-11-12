"use client";

import { useRef } from "react";

export default function MobileMenu({ children }) {
  const disclosure = useRef(null);
  return <details ref={disclosure} className="group md:hidden" onClick={(event) => {
    if (event.target.closest("a")) disclosure.current.open = false;
  }}>
    <summary className="flex min-h-11 items-center rounded-full border border-ink/30 px-5 font-editorial text-xs list-none">Menu <span aria-hidden="true" className="ml-3">☰</span></summary>
    <nav aria-label="Mobile navigation" className="absolute inset-x-0 top-full flex max-h-[calc(100dvh-5rem)] flex-col gap-3 overflow-y-auto overscroll-contain border-b border-ink/20 bg-tan px-6 py-5">{children}</nav>
  </details>;
}
