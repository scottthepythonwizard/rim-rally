"use client";

import { useId, useRef } from "react";
import { buttonClass } from "./ui";

export default function NoticeButton({ children, title = "Coming to the hub", message = "This feature is planned for a future release. Guest court booking is the focus of this frontend milestone.", className = "", plain = false }) {
  const dialog = useRef(null);
  const headingId = useId();
  return <>
    <button type="button" onClick={() => dialog.current.showModal()} className={`${plain ? "inline-flex min-h-11 items-center font-editorial text-xs underline-offset-4 hover:underline" : `${buttonClass} border border-current hover:opacity-70`} ${className}`}>{children}</button>
    <dialog ref={dialog} aria-labelledby={headingId} onClick={(event) => { if (event.target === dialog.current) dialog.current.close(); }} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-paper p-8 text-ink">
      <h2 id={headingId} className="text-2xl font-bold">{title}</h2>
      <p className="mt-4 text-sm leading-7">{message}</p>
      <form method="dialog" className="mt-6"><button autoFocus className={`${buttonClass} bg-ink text-white`}>Got it</button></form>
    </dialog>
  </>;
}
