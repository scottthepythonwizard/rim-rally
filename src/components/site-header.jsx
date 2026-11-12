"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Brand from "./brand";
import { ButtonLink } from "./ui";
import MobileMenu from "./mobile-menu";

export default function SiteHeader() {
  const pathname = usePathname();
  const [hash, setHash] = useState("");

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    const followLink = (event) => {
      const link = event.target.closest("a[href]");
      if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const destination = new URL(link.href);
      if (destination.origin === window.location.origin) setHash(destination.hash);
    };
    updateHash();
    document.addEventListener("click", followLink);
    window.addEventListener("hashchange", updateHash);
    window.addEventListener("popstate", updateHash);
    return () => {
      document.removeEventListener("click", followLink);
      window.removeEventListener("hashchange", updateHash);
      window.removeEventListener("popstate", updateHash);
    };
  }, []);

  const homeActive = pathname === "/" && hash !== "#about";
  const bookingActive = pathname.startsWith("/book/") || pathname.startsWith("/booking/");
  const aboutActive = (pathname === "/" && hash === "#about") || pathname.startsWith("/facilities/");
  const linkClass = "site-nav-link relative inline-flex min-h-11 items-center font-editorial";

  return <header className="relative z-20 border-b border-ink/20 bg-tan">
    <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-5 px-6 md:px-12">
      <Brand />
      <nav aria-label="Main navigation" className="hidden items-center gap-8 md:flex">
        <Link href="/" aria-current={homeActive ? "page" : undefined} className={`text-xs ${linkClass}`}>Home</Link>
        <Link href="/book/rim-and-rally?mode=open-play" aria-current={bookingActive ? "page" : undefined} className={`text-xs ${linkClass}`}>Book / Open play</Link>
        <Link href="/#about" aria-current={aboutActive ? "location" : undefined} className={`text-xs ${linkClass}`}>About</Link>
        <ButtonLink href="/login">Log in</ButtonLink>
      </nav>
      <MobileMenu>
          <Link href="/" aria-current={homeActive ? "page" : undefined} className={`py-2 text-sm ${linkClass}`}>Home</Link>
          <Link href="/book/rim-and-rally?mode=open-play" aria-current={bookingActive ? "page" : undefined} className={`py-2 text-sm ${linkClass}`}>Book / Open play</Link>
          <Link href="/#about" aria-current={aboutActive ? "location" : undefined} className={`py-2 text-sm ${linkClass}`}>About</Link>
          <ButtonLink href="/login">Log in</ButtonLink>
      </MobileMenu>
    </div>
  </header>;
}
