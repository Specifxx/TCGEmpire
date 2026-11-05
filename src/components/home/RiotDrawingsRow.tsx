import Link from "next/link";
import type { Country } from "@/lib/country";
import type { SealedGroup } from "@/lib/sealed-import";
import { RIOT_DRAWINGS, drawingStatus, drawingWindow } from "@/lib/riot-drawings";
import { RiotDrawingTiles, type DrawingTile } from "./RiotDrawingTiles";

// Riot's drawing-only drops, near the top of every home (owner, 2026-11-04:
// "the K/DA couture collection as well as the new worlds 2026 bundle … featured
// on the front page close to the top"; 2026-11-05: "It must be listed as an item
// and i want it to be on the front page as a clickable quickview open").
//
// Each product is a real sealed tile (SealedTile: a click opens the sealed quick
// view in place, a modified click its /sealed page), the same tile as the shelf
// below, drawn from the market's own group. The group always exists: the sealed
// loader synthesises it from lib/riot-drawings.ts until a resale row arrives
// (sealed-import.ts, computeAllSealedGroups), so the tile is never missing and
// the quick view says "No store is listing this right now" until eBay does.
//
// The page is one market-neutral cached render, so it passes every market's
// groups and the client half picks the visitor's, like HomeSealedShelf. The
// facts under each tile (price, dates, what is in the box, Riot's entry page)
// are computed here, on the server, from the same file; the status chip is
// dated from the render, and the home is cached six hours, so the dates are
// printed beside it.
export function RiotDrawingsRow({ groupsByCountry, today }: { groupsByCountry: Record<Country, SealedGroup[]>; today: string }) {
  const tiles: DrawingTile[] = RIOT_DRAWINGS.map((d) => {
    const status = drawingStatus(d, today);
    const window = drawingWindow(d);
    const chip =
      status === "open"
        ? { text: `Registration open · ${window}`, tone: "open" as const }
        : status === "upcoming"
          ? { text: `Drawing opens ${window}`, tone: "upcoming" as const }
          : { text: `Drawing closed · ran ${window}`, tone: "closed" as const };
    const emails = new Date(`${d.drawing.emails}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
    return {
      groupKey: d.groupKey,
      name: d.name,
      tagline: d.tagline,
      priceUsd: d.priceUsd,
      chip,
      line: `Selection emails from ${emails}; also at ${d.inPerson}.`,
      blogHref: `/blog/${d.blogSlug}`,
      riotUrl: d.riotUrl,
    };
  });
  return (
    <section aria-labelledby="home-riot-drawings">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="home-riot-drawings" className="text-xl font-extrabold text-white">
            New from Riot: the K/DA Couture Collection and the Worlds 2026 Edition
          </h2>
          <p className="text-sm text-slate-400">
            Sold only through the Riot Merch Store&apos;s free drawings and at the events, never by a store. Tap a box for
            its resale prices; what is in each, and when to register, is below it.
          </p>
        </div>
        <Link href={`/blog/${RIOT_DRAWINGS[0].blogSlug}`} className="text-sm font-semibold text-brand-400 hover:underline">
          Full guide →
        </Link>
      </div>
      <RiotDrawingTiles tiles={tiles} groupsByCountry={groupsByCountry} />
    </section>
  );
}
