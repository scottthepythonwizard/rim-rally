import "./globals.css";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

export const metadata = {
  title: { default: "Rim & Rally | Your next game starts here", template: "%s | Rim & Rally" },
  description: "Your home for pickleball and basketball. Explore the hub and plan your next game. Guest booking frontend prototype.",
};

export default function RootLayout({ children }) {
  return <html lang="en" data-scroll-behavior="smooth"><body className="antialiased"><a href="#main" className="sr-only fixed top-3 left-3 z-50 bg-ink px-5 py-3 text-white focus:not-sr-only">Skip to content</a><SiteHeader />{children}<SiteFooter /></body></html>;
}
