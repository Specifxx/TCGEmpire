import Link from "next/link";
import { seasonMarkupLive } from "@/lib/season";

// Halloween (until 31 October; owner, 2026-10-16: "Nocturne is going to come
// get you"): "Nocturne is coming", to his card, above the hero's logo. A
// seasonal callout in its own component, like CreatorsCornerBadge, so the
// hero's one secondary link stays its only one (tests/internal-linking.test.ts)
// and the whole season comes out by deleting this file and its call.
//
// In the HTML only around the season (seasonMarkupLive, a day of slack for the
// page cache), and shown only while <html> carries data-season="halloween"
// (lib/season.ts, globals.css .rb-nocturne), so it appears and goes at the
// visitor's own midnight.
export function NocturneComing() {
  if (!seasonMarkupLive("halloween")) return null;
  return (
    <div className="mb-3 flex justify-center sm:mb-4">
      <Link href="/card/nocturne-horrifying-ogn-194-298" className="rb-nocturne">
        <span className="rb-eyes" aria-hidden="true">
          <i />
          <i />
        </span>
        <b>Nocturne is coming</b>
        <span className="hidden sm:inline">· see his price before he finds you →</span>
      </Link>
    </div>
  );
}
