"use client";

import { useActionState, useRef, useSyncExternalStore } from "react";
import { fieldClass, primaryClass } from "./styles";
import { join } from "./actions";

export function ActionForm({ action, children, className, confirm, activeInvitationEmails }) {
  const failed = useRef(false);
  const [state, dispatch, pending] = useActionState(async (previous, formData) => {
    const result = await action(previous, formData);
    failed.current = Boolean(result.error);
    return result;
  }, {});
  return (
    <form action={dispatch} className={className} aria-busy={pending} onReset={(event) => {
      // React resets action forms after a response, including validation errors.
      if (failed.current) event.preventDefault();
    }} onSubmit={confirm ? (event) => {
      if (!window.confirm(confirm)) event.preventDefault();
    } : undefined}>
      <fieldset disabled={pending} className="min-w-0 space-y-3">{children}</fieldset>
      {pending && <p role="status" className="mt-3 text-sm">Submitting…</p>}
      {state.error && <p role="alert" className="mt-3 text-sm">{state.error}</p>}
      {state.message && <p role="status" className="mt-3 text-sm">{state.message}</p>}
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
