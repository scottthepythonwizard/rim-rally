import { Hero, CourtDiscovery, MembershipSection, LocationSection } from "@/features/home/landing-sections";
import { getFacility } from "@/services/facilities/facility-service";

export default async function HomePage() {
  const facility = await getFacility("rim-and-rally");
  return <main id="main"><Hero /><CourtDiscovery courts={facility.courts} /><MembershipSection /><LocationSection /></main>;
}
