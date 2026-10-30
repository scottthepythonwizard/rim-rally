import { ButtonLink } from "@/components/ui";
export default function NotFound() {
  return <main id="main" className="mx-auto min-h-[60vh] max-w-3xl px-6 py-24"><p className="text-xs tracking-widest uppercase">404 / Out of bounds</p><h1 className="mt-5 text-4xl font-bold">This court isn’t here.</h1><p className="mt-5 text-sm">Let’s get you back to the hub.</p><ButtonLink href="/" className="mt-8">Back home</ButtonLink></main>;
}
