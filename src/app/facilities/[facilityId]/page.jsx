/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { getFacility } from "@/services/facility-service";
import { ButtonLink, Eyebrow } from "@/components/ui";
import { CourtDiscovery } from "@/components/landing";

export const metadata = { title: "Explore the hub" };

export default async function FacilityPage({ params }) {
  const { facilityId } = await params;
  const facility = await getFacility(facilityId);
  if (!facility) notFound();
  return <main id="main"><section className="bg-tan px-6 py-16 md:px-12"><div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2"><div><Eyebrow>One hub. Two ways to play.</Eyebrow><h1 className="mt-5 text-5xl leading-none font-bold tracking-tight">{facility.name}</h1><p className="mt-6 text-sm leading-7">A place for your next rally, friendly match, or half-court run. {facility.hours}.</p><ul aria-label="Illustrative facility amenities" className="mt-6 flex flex-wrap gap-2">{facility.amenities.map((amenity) => <li key={amenity} className="rounded-full border border-ink/30 px-4 py-2 text-xs">{amenity}</li>)}</ul><ButtonLink href={`/book/${facilityId}`} className="mt-8">Choose your sport →</ButtonLink><p className="mt-5 text-xs leading-6">Demo facility information. Final address and amenities require confirmation.</p></div><img src="/images/placeholder.svg" alt="Facility image placeholder" className="aspect-square w-full rounded-tl-[90px] object-cover" /></div></section><CourtDiscovery courts={facility.courts} /></main>;
}
