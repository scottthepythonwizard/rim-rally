import { requireStaff } from "@/server/staff-session";
import { db } from "@/server/staff-store.mjs";
import { invite, manageAccount, revokeInvitation } from "@/features/staff/actions";
import { ActionForm } from "@/features/staff/forms";
import { fieldClass, primaryClass, secondaryClass } from "@/features/staff/styles";

export default async function AccountsPage() {
  const actor = await requireStaff(true);
  const accounts = db().prepare("SELECT id,email,role,active FROM accounts ORDER BY email").all();
  const invitations = db().prepare("SELECT email,role FROM invitations WHERE expires > unixepoch('subsec') * 1000 AND bootstrap=0 ORDER BY email").all();
  return <>
    <h1 className="font-editorial text-3xl sm:text-4xl">Accounts and roles</h1>
    <section className="mt-6 rounded-xl border border-ink/20 bg-tan/30 p-5">
      <h2 className="font-editorial text-xl">Invite a team member</h2>
      <ActionForm action={invite} activeInvitationEmails={invitations.map((entry) => entry.email)} className="mt-4">
        <label className="block max-w-md space-y-1 text-sm"><span>Email address</span><input className={fieldClass} type="email" name="email" autoComplete="email" spellCheck={false} autoCapitalize="none" required maxLength={254} /></label>
        <label className="block max-w-md space-y-1 text-sm"><span>Invitation role</span><select className={fieldClass} name="role"><option value="staff">Staff</option><option value="admin">Admin</option></select></label>
        <button className={primaryClass}>Create invitation</button>
      </ActionForm>
    </section>
    {invitations.length > 0 && <section className="mt-8 space-y-3">
      <h2 className="font-editorial text-xl">Pending invitations</h2>
      {invitations.map((entry) => <div key={entry.email} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/20 p-4">
        <p className="min-w-0 break-words text-sm">{entry.email} · {entry.role}</p>
        <ActionForm action={revokeInvitation}><input type="hidden" name="email" value={entry.email} /><button className={secondaryClass}>Revoke invitation</button></ActionForm>
      </div>)}
    </section>}
    <section className="mt-8 space-y-3">
      <h2 className="font-editorial text-xl">Team accounts</h2>
      {accounts.map((account) => <article key={account.id} className="rounded-xl border border-ink/20 p-4">
        <h3 className="break-words text-sm font-semibold">{account.email}{account.id === actor.id ? " (you)" : ""}</h3>
        <p className="mt-1 text-sm capitalize">{account.role} · {account.active ? "Active" : "Disabled"}</p>
        {account.id !== actor.id && <ActionForm action={manageAccount} className="mt-3">
          <input type="hidden" name="id" value={account.id} />
          <div className="grid max-w-md gap-3 sm:grid-cols-2">
            <label className="block text-sm">Role<select key={account.role} className={fieldClass} name="role" defaultValue={account.role}><option value="staff">Staff</option><option value="admin">Admin</option></select></label>
            <label className="block text-sm">Access<select key={account.active} className={fieldClass} name="active" defaultValue={String(account.active)}><option value="1">Active</option><option value="0">Disabled</option></select></label>
          </div>
          <button className={secondaryClass}>Save account</button>
        </ActionForm>}
      </article>)}
    </section>
  </>;
}
