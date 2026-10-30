import { Hero, CourtDiscovery, MembershipSection, LocationSection } from "@/components/landing";
import { getFacility } from "@/services/facility-service";

export default async function HomePage() {
  const facility = await getFacility("rim-and-rally");
  return <main id="main"><Hero /><CourtDiscovery courts={facility.courts} /><MembershipSection /><LocationSection /></main>;
}
