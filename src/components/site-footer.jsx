import Link from "next/link";
import Brand from "./brand";
import NoticeButton from "./notice-button";
import { Eyebrow } from "./ui";

export default function SiteFooter() {
  return <footer className="bg-ink px-6 pt-14 pb-6 text-paper md:px-12">
    <div className="mx-auto max-w-6xl">
      <div className="grid gap-10 pb-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.6fr]">
        <div><Brand light /><p className="mt-5 max-w-36 text-xs leading-6 text-paper/70">Built for games. Made for people.</p></div>
        <nav aria-label="Booking links"><Eyebrow className="text-[8px] text-paper/60">Play</Eyebrow><div className="mt-4 flex flex-col gap-4 font-editorial text-xs"><Link href="/book/rim-and-rally">Book a court</Link><Link href="/book/rim-and-rally?mode=open-play">Open play</Link><Link href="/#membership">Membership</Link></div></nav>
        <nav aria-label="Facility links"><Eyebrow className="text-[8px] text-paper/60">The hub</Eyebrow><div className="mt-4 flex flex-col gap-4 font-editorial text-xs"><Link href="/#about">About us</Link><Link href="/facilities/rim-and-rally">Visit the hub</Link><NoticeButton plain title="Contact details pending">Contact</NoticeButton></div></nav>
        <div><Eyebrow className="text-[8px] text-paper/60">Stay in the loop</Eyebrow><p className="mt-4 text-xs text-paper/80">Open play drops, game nights & more.</p><NoticeButton title="Newsletter is coming" message="Newsletter subscriptions are not part of this guest-booking release. No email address has been collected." className="mt-5 w-full justify-between border-paper/30 text-paper">Get updates <span aria-hidden="true">→</span></NoticeButton></div>
      </div>
      <div className="flex flex-col justify-between gap-3 border-t border-paper/15 pt-5 text-[9px] text-paper/65 sm:flex-row"><p>© {new Date().getFullYear()} Rim & Rally. Frontend prototype.</p><p>Images pending · Booking and payments are demonstrations.</p></div>
    </div>
  </footer>;
}
