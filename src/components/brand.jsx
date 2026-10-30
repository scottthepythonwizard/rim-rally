import Link from "next/link";

export function BrandMark({ className = "h-9 w-9" }) {
  return (
    <svg viewBox="0 0 54 54" fill="none" className={className} aria-hidden="true">
      <path d="M10 9h22l12 11-12 11H19v14M10 15h20l7 6-7 5H14v19M10 21h19M28 31l12 14M33 28l15 17" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M4 32h7M3 37h8M5 42h6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export default function Brand({ light = false }) {
  return (
    <Link href="/" aria-label="Rim and Rally home" className={`inline-flex shrink-0 items-center gap-2 ${light ? "text-paper" : "text-ink"}`}>
      <BrandMark />
      <span className="text-[13px] leading-tight font-bold tracking-[0.08em]">RIM & RALLY<span className="mt-0.5 block text-[8px] font-normal tracking-[0.24em]">SPORTS HUB</span></span>
    </Link>
  );
}
