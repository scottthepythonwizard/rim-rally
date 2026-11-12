import { Eyebrow } from "@/components/ui";
import { JoinForm } from "@/features/staff/forms";

export const metadata = { title: "Accept staff invitation", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function JoinPage() {
  return <main id="main" className="mx-auto min-h-[60vh] max-w-lg px-5 py-16">
    <Eyebrow>Rim & Rally staff</Eyebrow>
    <h1 className="mt-3 font-editorial text-4xl">Accept invitation</h1>
    <p className="mt-4 text-sm">Open your private invitation link here and choose a password for your account.</p>
    <JoinForm />
  </main>;
}
