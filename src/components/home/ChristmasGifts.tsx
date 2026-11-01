import Link from "next/link";
import { seasonMarkupLive } from "@/lib/season";

// Christmas (until Boxing Day): the line under the logo that Halloween gave to
// Nocturne now sends gift shoppers to every booster box and sealed price.
// Gated like NocturneComing: in the HTML around the season, shown only while
// <html> carries data-season="christmas" (globals.css .rb-gifts).
export function ChristmasGifts() {
  if (!seasonMarkupLive("christmas")) return null;
  return (
    <div className="rb-gifts-row mb-3 justify-center sm:mb-4">
      <Link href="/sealed" className="rb-gifts">
        <span className="rb-gifts-icon" aria-hidden="true" />
        <b>Christmas gifts</b>
        <span className="hidden sm:inline">· every booster box and bundle, cheapest first →</span>
      </Link>
    </div>
  );
}
