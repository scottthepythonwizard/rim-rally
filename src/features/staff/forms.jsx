"use client";

import { useActionState, useEffect, useRef, useSyncExternalStore } from "react";
import { fieldClass, primaryClass } from "./styles";
import { join } from "./actions";
import Link from "next/link";
import { STAFF_API_AVAILABLE } from "@/config/backend";
import { UnavailableNotice } from "@/components/ui/backend-unavailable";

export function ActionForm({ action, children, className, confirm, activeInvitationEmails }) {
  const failed = useRef(false);
  const errorMessage = useRef(null);
  const [state, dispatch, pending] = useActionState(async (previous, formData) => {
    const result = await action(previous, formData);
    failed.current = Boolean(result.error);
    return result;
  }, {});
  useEffect(() => { if (state.error) errorMessage.current?.focus(); }, [state]);
  return (
    <form action={dispatch} className={className} aria-busy={pending} onChange={(event) => {
      if (event.target.type === "file") event.target.setCustomValidity(event.target.files?.[0]?.size > 5 * 1024 * 1024 ? "Choose a payment proof file up to 5 MB." : "");
    }} onReset={(event) => {
      // React resets action forms after a response, including validation errors.
      if (failed.current) event.preventDefault();
    }} onSubmit={(event) => {
      if (!STAFF_API_AVAILABLE || (confirm && !window.confirm(confirm))) event.preventDefault();
    }}>
      {!STAFF_API_AVAILABLE && <UnavailableNotice />}
      <fieldset disabled={pending || !STAFF_API_AVAILABLE} className="min-w-0 space-y-3">{children}</fieldset>
      {pending && <p role="status" className="mt-3 text-sm">Submitting…</p>}
      {state.error && <p ref={errorMessage} tabIndex={-1} role="alert" className="mt-3 text-sm">{state.error}</p>}
      {state.loginRequired && <Link className="mt-3 inline-flex min-h-11 items-center underline" href="/login">Log in again</Link>}
      {state.message && <p role="status" className="mt-3 text-sm">{state.message}</p>}
      {state.bookingId && <Link className="mt-3 inline-flex min-h-11 items-center underline" href={`/dashboard/bookings/${state.bookingId}`}>Open booking details</Link>}
      {state.invitation && !pending && activeInvitationEmails?.includes(state.invitationEmail) && <div className="mt-4 space-y-2">
        <p role="status" className="text-sm">Invitation created. Share this private link with the intended recipient. It expires in 24 hours.</p>
        <label className="block text-sm">Invitation link
          <input name="invitation-link" autoComplete="off" spellCheck={false} readOnly value={state.invitation} onFocus={(event) => event.target.select()} className={fieldClass} />
        </label>
      </div>}
    </form>
  );
}

function subscribe(callback) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

export function JoinForm() {
  const invitation = useSyncExternalStore(subscribe, () => window.location.hash.slice(1), () => "");
  return <ActionForm action={join} className="mt-6">
    <input type="hidden" name="invitation" value={invitation} />
    {!invitation && <p role="status" className="text-sm">Open the complete invitation link sent by your admin, including the code after #, to create your account.</p>}
    <label className="block space-y-1 text-sm">
      <span>Choose a password</span>
      <input className={fieldClass} type="password" name="password" autoComplete="new-password" minLength={12} maxLength={128} required />
    </label>
    <p className="text-xs text-ink/70">Use 12 to 128 characters.</p>
    <button className={primaryClass} disabled={!invitation}>Create account</button>
  </ActionForm>;
}
