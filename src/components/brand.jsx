import Link from "next/link";
import Image from "next/image";
import logo from "../images/logo.jpg";

export function BrandMark({ className = "h-12 w-12" }) {
  return (
    <Image src={logo} alt="" sizes="80px" className={`object-contain ${className}`} />
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
