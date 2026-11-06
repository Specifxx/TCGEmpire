import { HolidaySalePage, holidayMetadata } from "@/components/HolidaySalePage";

// /cyber-monday (2026-11-06, DECISIONS.md "Black Friday and Cyber Monday price watch pages"): the
// Black Friday page under Cyber Monday's own URL, title and FAQ, so the Monday query has a page of
// its own. One URL kept all year. Six hours, the floor for pages buyers act on; the page reads
// getCountry(), so it renders per request anyway.
export const revalidate = 21600;

export const generateMetadata = () => holidayMetadata("cyber-monday");

export default function Page() {
  return <HolidaySalePage event="cyber-monday" />;
}
