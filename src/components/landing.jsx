/* eslint-disable @next/next/no-img-element -- Local SVG placeholders; photography will be supplied by the user. */
import Link from "next/link";
import { BrandMark } from "./brand";
import { Arrow, ButtonLink, Eyebrow } from "./ui";
import NoticeButton from "./notice-button";

export function Hero() {
  return <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-tan">
    <div className="absolute inset-y-0 right-0 hidden w-[58%] md:block">
      <img src="/images/placeholder.svg" alt="Hero image placeholder" fetchPriority="high" className="h-full w-full object-cover object-center [mask-image:linear-gradient(to_right,transparent,black_38%)]" />
    </div>
    <div className="relative mx-auto grid max-w-7xl md:min-h-[620px] md:grid-cols-2">
      <div className="flex flex-col items-center justify-center px-6 pt-14 pb-12 text-center md:px-12 md:py-20">
        <BrandMark className="mb-3 h-20 w-20" />
        <Eyebrow className="mb-8 text-[8px]">RIM & RALLY SPORTS HUB</Eyebrow>
        <h1 id="hero-title" className="max-w-md text-[44px] leading-[0.98] font-bold tracking-[-0.055em] sm:text-[58px]">Your home for<br />pickleball and<br />basketball.</h1>
        <p className="mt-6 text-sm">Built for games. Made for people.</p>
        <div className="mt-8 flex w-full max-w-sm flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href="/book/rim-and-rally" className="shrink-0">Book a court <Arrow /></ButtonLink>
          <ButtonLink href="/book/rim-and-rally?mode=open-play" outline>View open play</ButtonLink>
        </div>
      </div>
      <img src="/images/placeholder.svg" alt="Hero image placeholder" className="aspect-square w-full object-cover md:hidden" />
    </div>
  </section>;
}

export function CourtDiscovery({ courts }) {
  return <section id="courts" aria-labelledby="courts-title" className="bg-court px-6 py-16 md:px-12 md:py-24">
    <div className="mx-auto max-w-6xl">
      <Eyebrow>More ways to play</Eyebrow>
      <div className="mt-4 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <h2 id="courts-title" className="max-w-2xl text-4xl leading-[0.98] font-bold tracking-[-0.045em] md:text-6xl">WHY CHOOSE ONE WHEN<br className="hidden lg:block" /> YOU CAN HAVE BOTH?</h2>
        <p className="max-w-56 text-sm leading-6">From a quick rally to a full-court run, your next game is already waiting.</p>
      </div>
      <div className="mt-10 grid gap-10 md:grid-cols-2 md:gap-6">
        {courts.map((court) => <article key={court.id}>
          <Link href={`/book/rim-and-rally?sport=${court.sport}`} className="group relative block overflow-hidden rounded-t-[24px]" aria-label={`Check availability for ${court.name}`}>
            <img src={court.image} alt={court.alt} loading="lazy" className="aspect-square w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105" />
            <span className="absolute top-4 right-4 rounded-full bg-paper px-4 py-2 font-editorial text-xs">{court.label}</span>
          </Link>
          <Eyebrow className="mt-5 text-[8px]">A good game starts here</Eyebrow>
          <h3 className="mt-2 font-editorial text-2xl">{court.name}</h3>
          <Link href={`/book/rim-and-rally?sport=${court.sport}`} className="mt-1 inline-flex min-h-11 items-center gap-2 font-editorial text-xs underline underline-offset-4">Check availability <Arrow /></Link>
        </article>)}
      </div>
    </div>
  </section>;
}

export function MembershipSection() {
  return <section id="membership" aria-labelledby="membership-title" className="bg-ink px-6 py-16 text-paper md:px-12 md:py-24">
    <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2 md:gap-20">
      <div><Eyebrow>For the regulars</Eyebrow><h2 id="membership-title" className="mt-4 text-4xl leading-none font-bold tracking-[-0.04em] md:text-5xl">RIM & RALLY<br />MEMBERSHIP</h2><p className="mt-6 max-w-sm text-sm leading-7 text-paper/75">Unlimited open play for members, plus club privileges made for regular players.</p></div>
      <div className="border border-paper/30 p-7 md:p-9">
        <div className="grid grid-cols-2 gap-4 border-b border-paper/20 pb-6"><div><p className="font-editorial text-3xl">₱1,600</p><p className="mt-2 text-xs text-paper/70">per month · without shirt</p></div><div><p className="font-editorial text-3xl">₱1,800</p><p className="mt-2 text-xs text-paper/70">per month · with club shirt</p></div></div>
        <ul className="my-6 divide-y divide-paper/15 text-xs leading-5 text-paper/85"><li className="py-3">— Unlimited open play for one month</li><li className="py-3">— Free Rim & Rally sticker for your gate pass</li><li className="py-3">— Priority access to club activities and events</li><li className="py-3">— Privilege to represent Rim & Rally in tournaments</li></ul>
        <NoticeButton title="Membership is coming" className="bg-tan text-ink">Explore membership <Arrow /></NoticeButton>
        <p className="mt-4 text-[10px] text-paper/60">Prototype pricing. Membership sales are not available.</p>
      </div>
    </div>
  </section>;
}

export function LocationSection() {
  return <section id="about" aria-labelledby="location-title" className="bg-tan px-6 py-16 md:px-12 md:py-20">
    <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2 md:gap-20">
      <div><Eyebrow>Where to play</Eyebrow><h2 id="location-title" className="mt-4 text-5xl leading-none font-bold tracking-[-0.045em]">FIND THE HUB.</h2><p className="mt-6 max-w-sm text-sm leading-7">One welcoming space for competitive runs, casual rallies, and everyone in between. Why choose one when you can have both?</p>
        <dl className="mt-7 border-t border-ink/20 text-xs"><div className="grid grid-cols-[64px_1fr] gap-4 border-b border-ink/20 py-4"><dt className="text-[9px] uppercase">Location</dt><dd className="font-editorial leading-6">Carlos Trinidad Ave, Salitran IV, Dasmariñas, Philippines</dd></div><div className="grid grid-cols-[64px_1fr] gap-4 border-b border-ink/20 py-4"><dt className="text-[9px] uppercase">Hours</dt><dd className="font-editorial leading-6">Daily, 8:00 AM–12:00 midnight</dd></div><div className="grid grid-cols-[64px_1fr] gap-4 border-b border-ink/20 py-4"><dt className="text-[9px] uppercase">Also on</dt><dd className="font-editorial leading-6">ReClub</dd></div></dl>
        <ButtonLink href="/facilities/rim-and-rally" className="mt-5">Plan your visit <Arrow /></ButtonLink>
      </div>
      <div className="relative"><img src="/images/placeholder.svg" alt="Facility image placeholder" loading="lazy" className="aspect-square w-full rounded-tl-[110px] object-cover" /><span className="absolute -bottom-4 left-3 flex h-20 w-20 -rotate-12 items-center justify-center rounded-full border border-tan bg-ink text-center text-[10px] font-bold tracking-widest text-paper">PLAY.<br />RALLY.<br />REPEAT.</span></div>
    </div>
  </section>;
}
