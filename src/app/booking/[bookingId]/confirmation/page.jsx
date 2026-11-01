import Confirmation from "@/features/checkout/confirmation";
export const metadata = { title: "Booking pass", robots: { index: false, follow: false } };
export default async function Page({ params }) { const { bookingId } = await params; return <main id="main"><Confirmation bookingId={bookingId} /></main>; }
