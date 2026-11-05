import { normalizeCountry } from "@/lib/country";
import { setBySlug } from "@/lib/constants";
import { buildSetView } from "@/lib/set-view";
import type { CardQuery } from "@/lib/cards";

// A set page's view for one market (2026-11-05, DECISIONS.md "The set pages
// become one CDN copy per URL"). The page's HTML carries the baseline market;
// the island (components/sets/SetMarketBoard.tsx) fetches this for a visitor in
// another market, with the page's own filter, sort and paging query repeated.
// The same computation as the page (lib/set-view.ts); the CDN keeps each (set,
// market, query) answer six hours, a day stale. Reads no cookie, header or
// session. `q` is allowed: the panel's keyword narrows one set's grid and was
// never metered (a set page is not a site search).
export const dynamic = "force-dynamic";

const KEYS = [
  "q", "domain", "rarity", "type", "variant", "tag", "rules", "rulesSet", "sig", "over", "ult", "promo",
  "printing", "priced", "min", "max", "sort", "page", "size",
] as const satisfies readonly (keyof CardQuery)[];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const set = setBySlug(url.searchParams.get("set") ?? "");
  if (!set) return new Response("unknown set", { status: 404, headers: { "Cache-Control": "no-store" } });
  const market = normalizeCountry(url.searchParams.get("market"));
  const sp: CardQuery = {};
  for (const k of KEYS) {
    const v = url.searchParams.get(k);
    if (v) sp[k] = v;
  }
  const view = await buildSetView(set, market, sp);
  return Response.json(view, {
    headers: {
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
