"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCountry } from "../CountryProvider";
import { PRICE_BANDS, inPriceBand, totalFor, type MarketTotals, type PriceBand } from "@/lib/published-decks";

export interface LibraryDeck {
  slug: string;
  title: string;
  authorName: string | null;
  legendName: string;
  legendSlug: string;
  domains: string[];
  cardCount: number;
  createdAt: string;
  totals: MarketTotals;
}

// /decks' filters run in the browser over the ISR-cached list (2026-09-26), so
// the page stays one cached render per hour however it is filtered. Each tile's
// cost is the deck's CURRENT total in the viewer's market.
export function DeckLibrary({ decks, legends, domains }: { decks: LibraryDeck[]; legends: { slug: string; name: string }[]; domains: string[] }) {
  const { country, fmt } = useCountry();
  const [legend, setLegend] = useState("");
  const [domain, setDomain] = useState("");
  const [band, setBand] = useState<PriceBand>("all");
  const [sort, setSort] = useState<"newest" | "cheapest">("newest");

  const shown = useMemo(() => {
    const rows = decks.filter(
      (d) =>
        (!legend || d.legendSlug === legend) &&
        (!domain || d.domains.includes(domain)) &&
        inPriceBand(totalFor(d.totals, country), band),
    );
    if (sort === "cheapest") {
      rows.sort((a, b) => (totalFor(a.totals, country) ?? Infinity) - (totalFor(b.totals, country) ?? Infinity));
    }
    return rows;
  }, [decks, legend, domain, band, sort, country]);

  const select = "input w-full cursor-pointer sm:w-auto";
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {legends.length > 0 && (
          <select aria-label="Legend" value={legend} onChange={(e) => setLegend(e.target.value)} className={select}>
            <option value="">All legends</option>
            {legends.map((l) => (
              <option key={l.slug} value={l.slug}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        <select aria-label="Domain" value={domain} onChange={(e) => setDomain(e.target.value)} className={select}>
          <option value="">All domains</option>
          {domains.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select aria-label="Price" value={band} onChange={(e) => setBand(e.target.value as PriceBand)} className={select}>
          {PRICE_BANDS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
        <select aria-label="Sort decks" value={sort} onChange={(e) => setSort(e.target.value as "newest" | "cheapest")} className={select}>
          <option value="newest">Newest</option>
          <option value="cheapest">Cheapest</option>
        </select>
      </div>

      {shown.length === 0 ? (
        <p className="card-surface mt-4 p-6 text-center text-sm text-slate-400">
          No published deck matches those filters.{" "}
          <Link href="/deck" className="font-semibold text-brand-300 hover:underline">
            Publish one from the deck builder →
          </Link>
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((d) => {
            const total = totalFor(d.totals, country);
            return (
              <li key={d.slug}>
                <Link href={`/decks/${d.slug}`} className="card-surface flex h-full flex-col gap-1 p-4 transition-colors hover:border-brand-500/60">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{d.legendName}</span>
                  <span className="font-bold text-white">{d.title}</span>
                  <span className="text-xs text-slate-400">
                    {d.domains.join(" · ") || "—"} · {d.cardCount} cards{d.authorName ? ` · by ${d.authorName}` : ""}
                  </span>
                  <span className="num mt-auto pt-2 text-lg font-bold text-accent">
                    {total != null ? fmt(total) : <span className="text-sm font-normal text-slate-500">Not all cards priced in {country}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
