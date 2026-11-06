import { HolidaySalePage, holidayMetadata } from "@/components/HolidaySalePage";

// /black-friday (2026-10-30, DECISIONS.md "A Black Friday deals page on RiftCompare"; the price watch
// joined it 2026-11-06). One URL kept all year. Six hours, the floor for pages buyers act on; the
// page reads getCountry(), so it renders per request anyway.
export const revalidate = 21600;

export const generateMetadata = () => holidayMetadata("black-friday");

export default function Page() {
  return <HolidaySalePage event="black-friday" />;
}
