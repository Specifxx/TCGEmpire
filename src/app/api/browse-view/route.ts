import { normalizeCountry } from "@/lib/country";
import { buildBrowseView } from "@/lib/browse-view";
import type { CardQuery } from "@/lib/cards";

// The /browse page's view for one market (2026-11-05, DECISIONS.md "The card list
// becomes one CDN copy per URL"). The page's HTML carries the baseline market;
// the island (components/browse/BrowseMarketBoard.tsx) fetches this for a
// visitor in another market, with the page's own filter, sort and paging query
// repeated. The same computation as the page (lib/browse-view.ts); the CDN
// keeps each (market, query) answer six hours, a day stale. Reads no cookie,
// header or session.
//
// NEVER a text search: `?q=` on /browse is metered per account
// (lib/search-quota-server.ts) and rendered by app/browse/search/page.tsx for
// the visitor's own market, so the island never asks for one, and an answer
// here would be the allowance's back door.
export const dynamic = "force-dynamic";

const KEYS = [
  "domain", "rarity", "type", "set", "variant", "tag", "rules", "rulesSet", "sig", "over", "ult", "promo",
  "printing", "priced", "min", "max", "sort", "page", "size",
] as const satisfies readonly (keyof CardQuery)[];

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("q")) return new Response("a search is not served here", { status: 400, headers: { "Cache-Control": "no-store" } });
  const market = normalizeCountry(url.searchParams.get("market"));
  const sp: CardQuery = {};
  for (const k of KEYS) {
    const v = url.searchParams.get(k);
    if (v) sp[k] = v;
  }
  const view = await buildBrowseView(market, sp);
  return Response.json(view, {
    headers: {
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
