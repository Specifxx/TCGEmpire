import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeSearch } from "@/lib/format";
import { buildCardWhere, cardTileSelect } from "@/lib/cards";
import { parseSearchQuery } from "@/lib/search-query";
import { getSealedGroups } from "@/lib/sealed-import";
import { loadSealedForSearch, matchSealedGroups } from "@/lib/sealed-search";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES, priceField } from "@/lib/country";
import { didYouMean } from "@/lib/did-you-mean";
import { getPriceGuideRows } from "@/lib/price-guide";
import { meterAndStore, quotaContext } from "@/lib/search-quota-server";

// Typeahead search for the navbar dropdown. Returns full tile data so a result can
// open the same instant quick-view modal as the browse grid, plus any matching
// sealed products (booster boxes/packs/etc.). A sealed match carries its whole
// price board (the SealedGroup, listings and all) so the dropdown row opens the
// sealed quick view in place, like a card row does, with no second request
// (2026-10-04). At most four, so the payload stays a few KB.
//
// SEARCH IS METERED BY TIER (2026-10-09, owner): signed out 10 searches a day,
// a free account 30, Plus 100, Premium unlimited (lib/search-quota.ts). This
// reverses the 2026-09-28 "keep price comparison fully free" rule for search
// only, after the owner was shown what the earlier 10/100/unlimited ladder cost
// (pages/visitor 3.86 -> 2.75, buy clicks ~40% down in about a day). Card, set,
// champion and store pages stay unmetered, crawlers are never metered, and
// SEARCH_CAPS=off switches the whole meter off. Store tools that look a card up
// (Best Basket, the deck pricer, the trade calculator, the collection) pass
// scope=tool and are not counted.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [], sealed: [] });

  // The daily allowance. A tool lookup is not a search; everything else is
  // metered here, and a refused query gets the tier and limit so the dropdown
  // can say what the next tier gives.
  let quota: { used: number; limit: number } | undefined;
  if (searchParams.get("scope") !== "tool") {
    const ctx = await quotaContext();
    if (ctx.metered) {
      const d = meterAndStore(ctx, q);
      if (!d.allowed) {
        return NextResponse.json(
          { results: [], sealed: [], limited: true, tier: ctx.tier, limit: ctx.limit, used: d.used },
          { headers: { "Cache-Control": "private, no-store" } },
        );
      }
      quota = { used: d.used, limit: ctx.limit as number };
    }
  }

  const country = getCountry();
  // Same parser and the same WHERE the browse grid uses, so "akali overnumbered",
  // "shen signature riftbound" and "armpit boi" return here exactly what they
  // return there. This route used to build its own two-clause OR, which meant the
  // typeahead could only ever match a bare name — and a visitor who arrived from
  // a Google search for a printing and retyped that phrase got an empty dropdown.
  const parsed = parseSearchQuery(q);
  // The prefix re-rank compares against the NAME half only: "shen signature"
  // should rank Shen at the top, and "shensignature" is a prefix of nothing.
  const nq = normalizeSearch(parsed.name || q);
  const aliasHits = new Set(parsed.aliasSlugs);
  const [cards, sealedRead] = await Promise.all([
    prisma.card.findMany({
      where: buildCardWhere({ q }, country),
      // Overfetch, then re-rank below: NAME-PREFIX matches first, then priced.
      // Priced-first alone buried unpriced new reveals (every pre-release Jayce
      // lost its dropdown slot to priced older Jayces) — "not in the database".
      orderBy: [
        { [priceField(country)]: { sort: "desc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput,
        { name: "asc" },
      ],
      take: 24,
      // nameNormalized feeds the prefix re-rank below (not part of the tile select).
      select: { ...cardTileSelect(country), nameNormalized: true },
    }),
    // Sealed groups load + group the whole sealed table — far too heavy to redo on
    // every keystroke. getSealedGroups caches itself (per-instance memo plus the
    // shared data cache); wrapping it in another unstable_cache here disabled
    // the shared layer, because Next.js bypasses a cache nested in a cache.
    // A market with no sealed rows of its own falls back to the default market,
    // priced in its currency (loadSealedForSearch), as /sealed does.
    loadSealedForSearch(country, getSealedGroups),
  ]);

  // Prefix matches beat substring matches regardless of price; within each group
  // the DB's priced-first order is preserved. Cap to the dropdown size after.
  // A nickname hit ranks above everything: "armpit boi" names one printing and
  // nothing else, so it is the answer, not a candidate.
  const rank = (c: { slug?: string; nameNormalized?: string }) =>
    c.slug && aliasHits.has(c.slug) ? 0 : c.nameNormalized?.startsWith(nq) ? 1 : 2;
  const ranked = [...cards]
    .sort((a, b) => rank(a as { slug?: string; nameNormalized?: string }) - rank(b as { slug?: string; nameNormalized?: string }))
    .slice(0, 10);

  // Every word of the query, in any order, against the name, type, set code and
  // the set's own name (lib/sealed-search.ts): "origins" finds the Origins boxes
  // and "booster box origins" does too. The browse results use the same matcher.
  const sealed = matchSealedGroups(sealedRead.groups, q).slice(0, 4);
  const sealedCurrency = COUNTRIES[sealedRead.priceCountry].currency;

  // Nothing at all: offer near-miss names ("Did you mean?", 2026-10-02) from
  // the price guide's self-caching catalogue — a warm memo, no new database
  // read. Called here at route level, never inside a cache callback (rule 6).
  // Fails open to no suggestion.
  let suggest: string[] = [];
  if (ranked.length === 0 && sealed.length === 0) {
    const rows = await getPriceGuideRows().catch(() => null);
    if (rows) suggest = didYouMean(parsed.name || q, rows.map((r) => r.n));
  }

  return NextResponse.json(
    { results: ranked, sealed, sealedCurrency, ...(suggest.length ? { suggest } : {}), ...(quota ? { quota } : {}) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
