import "./globals.css";
import SiteHeader from "@/components/layout/site-header";
import SiteFooter from "@/components/layout/site-footer";

export const metadata = {
  title: { default: "Rim & Rally | Your next game starts here", template: "%s | Rim & Rally" },
  description: "Your home for pickleball and basketball. Explore the hub and plan your next game. Guest booking frontend prototype.",
};

export default function RootLayout({ children }) {
  return <html lang="en" data-scroll-behavior="smooth"><body className="antialiased"><a href="#main" className="sr-only fixed top-3 left-3 z-50 bg-ink px-5 py-3 text-white focus:not-sr-only">Skip to content</a><SiteHeader />
    {process.env.NODE_ENV === "development" && process.env.RIM_RALLY_LOCAL_DEMO !== "1" && process.env.NEXT_PUBLIC_API_MODE === "server" && <p className="bg-tan px-4 py-2 text-center text-sm font-semibold">Backend testing · Connected Django API</p>}
    {children}<SiteFooter /></body></html>;
}
