import { ScheduleSkeleton } from "@/features/booking/booking-flow";
export default function LoadingSchedule() {
  return <main id="main" className="mx-auto min-h-[65vh] max-w-7xl px-5 py-16 md:px-10"><h1 className="mb-10 text-4xl font-bold">Finding your next game…</h1><ScheduleSkeleton /></main>;
}
