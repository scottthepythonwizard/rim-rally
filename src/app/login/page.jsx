import { redirect } from "next/navigation";
import { currentStaff } from "@/server/staff-session";
import { Eyebrow } from "@/components/ui/primitives";
import { login } from "@/features/staff/actions";
import { ActionForm } from "@/features/staff/forms";
import { fieldClass, primaryClass } from "@/features/staff/styles";
import { STAFF_API_AVAILABLE } from "@/config/backend";

export const metadata = { title: "Staff login" };
export default async function LoginPage({ searchParams }) {
  if (await currentStaff()) redirect("/dashboard");
  const { created, expired } = await searchParams;
  return <main id="main" className="mx-auto min-h-[60vh] max-w-lg px-5 py-16">
    <Eyebrow>Rim & Rally staff</Eyebrow>
    <h1 className="mt-3 font-editorial text-4xl">Log in</h1>
    {STAFF_API_AVAILABLE && expired === "1" && <p role="status" className="mt-4 text-sm">Your staff session expired or your access changed. Log in again.</p>}
    {STAFF_API_AVAILABLE && created === "1" && <p role="status" className="mt-4 text-sm">Account created. Log in with your invited email and new password.</p>}
    <ActionForm action={login} className="mt-6 rounded-xl border border-ink/20 p-5 sm:p-7">
      <label className="block space-y-1 text-sm"><span>Email address</span><input className={fieldClass} type="email" name="email" autoComplete="username" spellCheck={false} autoCapitalize="none" required maxLength={254} /></label>
      <label className="block space-y-1 text-sm"><span>Password</span><input className={fieldClass} type="password" name="password" autoComplete="current-password" required maxLength={128} /></label>
      <button className={primaryClass}>Log in</button>
    </ActionForm>
  </main>;
}
