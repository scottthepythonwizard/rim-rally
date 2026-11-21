import Link from "next/link";

export const buttonClass = "inline-flex min-h-11 items-center justify-center gap-3 rounded-full px-6 py-3 text-center font-editorial text-xs transition-colors focus-visible:outline-offset-4";

export function ButtonLink({ href, children, outline = false, className = "", ...props }) {
  return <Link href={href} className={`${buttonClass} ${outline ? "border border-current hover:bg-ink/5" : "bg-ink text-white hover:bg-ink/80"} ${className}`} {...props}>{children}</Link>;
}

export function Eyebrow({ children, className = "" }) {
  return <p className={`text-[10px] leading-relaxed font-medium tracking-[0.22em] uppercase ${className}`}>{children}</p>;
}

export function Arrow({ className = "" }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" /></svg>;
}
