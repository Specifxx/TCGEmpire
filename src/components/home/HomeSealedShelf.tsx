"use client";

import Link from "next/link";
import type { Country } from "@/lib/country";
import type { SealedGroup } from "@/lib/sealed-import";
import { useCountry } from "@/components/CountryProvider";
import { SealedTile } from "@/components/SealedTile";

// The homepage's sealed shelf (2026-10-28, owner: sealed is as big a market as
// singles, so it belongs on the front page). The page is one market-neutral
// cached render, so it passes the shelf for every market and this picks the
// visitor's, the same way TodaysTopDeals does. Tiles open the sealed quick view
// in place (RiftCompare has no sealed detail page), exactly as on /sealed.
export interface SealedShelf {
  groups: SealedGroup[];
  currency: string;
  /** Product types this market has in stock, so a chip never opens an empty filter. */
  types: string[];
}

const TYPE_LINKS: { label: string; type: string }[] = [
  { label: "Booster boxes", type: "Booster Box" },
  { label: "Booster packs", type: "Booster Pack" },
  { label: "Proving Grounds", type: "Proving Grounds" },
  { label: "Bundles", type: "Bundle" },
  { label: "Booster cases", type: "Booster Case" },
];

export function HomeSealedShelf({ shelves }: { shelves: Record<Country, SealedShelf> }) {
  const { country } = useCountry();
  const shelf = shelves[country] ?? shelves.US;
  if (!shelf || shelf.groups.length === 0) return null;
  return (
    <section aria-labelledby="home-sealed">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="home-sealed" className="text-xl font-extrabold text-white">Booster boxes and sealed</h2>
          <p className="text-sm text-slate-400">The cheapest in-stock price for every sealed product, compared across stores.</p>
        </div>
        <Link href="/sealed" className="text-sm font-semibold text-brand-400 hover:underline">All sealed prices →</Link>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {shelf.groups.map((g) => (
          <SealedTile key={g.groupKey} group={g} currency={shelf.currency} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {TYPE_LINKS.filter((t) => shelf.types.includes(t.type)).map((t) => (
          <Link key={t.type} href={`/sealed?type=${encodeURIComponent(t.type)}`} className="chip text-xs hover:border-brand-500/60 hover:text-white">
            {t.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
