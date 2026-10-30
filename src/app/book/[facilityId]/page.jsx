import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getFacility } from "@/services/facility-service";
import { Eyebrow } from "@/components/ui";
import BookingFlow, { ScheduleSkeleton } from "@/features/booking/booking-flow";

export const metadata = { title: "Book a court" };

export default async function BookingPage({ params }) {
  const { facilityId } = await params;
  const facility = await getFacility(facilityId);
  if (!facility) notFound();
  // Capture time per request; availability responses subsequently supply serverNow.
  const serverNow = new Date().toISOString();
  return <main id="main" className="mx-auto min-h-[65vh] max-w-7xl px-5 pt-8 pb-28 md:px-10 md:pt-10 lg:pb-20">
    <Eyebrow>{facility.name}</Eyebrow><h1 className="mt-3 max-w-3xl text-3xl leading-[1.05] font-bold tracking-[-0.04em] md:text-4xl">LET’S MAKE TIME TO PLAY.</h1>
    <p className="mt-3 mb-7 max-w-xl text-sm leading-7 text-ink/70">A quick rally or a half-court run. Find your day, choose your court, and make it yours.</p>
    <Suspense fallback={<ScheduleSkeleton />}><BookingFlow facility={facility} serverNow={serverNow} /></Suspense>
  </main>;
}
