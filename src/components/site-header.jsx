import Link from "next/link";
import Brand from "./brand";
import NoticeButton from "./notice-button";
import MobileMenu from "./mobile-menu";

export default function SiteHeader() {
  return <header className="relative z-20 border-b border-ink/20 bg-tan">
    <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-5 px-6 md:px-12">
      <Brand />
      <nav aria-label="Main navigation" className="hidden items-center gap-8 md:flex">
        <Link href="/" className="font-editorial text-xs underline underline-offset-8">Home</Link>
        <Link href="/book/rim-and-rally?mode=open-play" className="font-editorial text-xs hover:underline">Book / Open play</Link>
        <Link href="/#about" className="font-editorial text-xs hover:underline">About</Link>
        <NoticeButton title="Log in is coming" className="bg-ink text-white">Log in</NoticeButton>
      </nav>
      <MobileMenu>
          <Link href="/" className="py-2 font-editorial text-sm">Home</Link>
          <Link href="/book/rim-and-rally?mode=open-play" className="py-2 font-editorial text-sm">Book / Open play</Link>
          <Link href="/#about" className="font-editorial text-xs hover:underline">About</Link>
          <NoticeButton title="Log in is coming" className="bg-ink text-white">Log in</NoticeButton>
      </MobileMenu>
    </div>
  </header>;
}
