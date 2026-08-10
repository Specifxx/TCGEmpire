import { revalidatePath, revalidateTag } from "next/cache";
import { SECTIONS } from "./sitemap-sections";

// On-demand ISR revalidation, invoked after the daily/twice-daily price import
// writes new data. This is the freshness half of the "don't hammer Neon" strategy:
// the price-derived surfaces are read from cache, refreshed ON-DEMAND by this call,
// with a 24h TTL fallback — so Postgres is read ~twice a day (per import) instead of
// on a short timer. A missed ping just caps staleness at 24h ("Updated daily").
//
// Must run inside a route handler / server action (request scope) — see
// /api/revalidate and /api/cron/refresh-prices.
export const CONTENT_TAG = "content";

export function revalidateContent(): string[] {
  // GENUINELY STATIC / ISR pages (no cookie or searchParams read). Passing the
  // dynamic route pattern with "page" purges EVERY matching URL — all ~1,200
  // /card/* pages at once — which is the whole point.
  const staticPaths: [string, "page"][] = [
    ["/", "page"],
    ["/movers", "page"],
    // Box EV became genuinely static once it stopped reading cookies() for the
    // country (it now values everything in USD and converts client-side), so it
    // needs purging here or it would serve prices up to 24h stale after an
    // import instead of refreshing with everything else.
    ["/tools/box-ev", "page"],
    ["/domains", "page"],
    ["/card/[id]", "page"],
    ["/sets/[set]", "page"],
    ["/domains/[slug]", "page"],
  ];
  for (const [p, type] of staticPaths) revalidatePath(p, type);

  // The sitemap is the crawler's discovery source — refresh so new cards appear.
  // It's now an INDEX plus one child per section (see lib/sitemap-sections.ts),
  // and the index itself is a static list of section URLs that never changes —
  // it's the CHILDREN that carry the data, so purging only /sitemap.xml would
  // leave every actual URL list stale for up to 24h after an import.
  // Each child is purged BY NAME rather than via the dynamic-route pattern:
  // revalidatePath's type argument only accepts "page" | "layout", so there's no
  // supported way to purge every instance of a dynamic ROUTE HANDLER in one call.
  // Iterating SECTIONS keeps this correct as sections are added — it is not a
  // hand-maintained list, so a new child sitemap can't be forgotten here.
  revalidatePath("/sitemap.xml");
  for (const id of SECTIONS) revalidatePath(`/sitemaps/${id}.xml`);

  // The cookie/searchParams-DYNAMIC price pages (/market, /decks, /decks/[slug],
  // /decks/archetype/[slug], /decks/domain/[slug], /tools/box-ev) render
  // per-request, so revalidatePath can't purge
  // them — but each wraps its heavy DB read in unstable_cache tagged CONTENT_TAG
  // (as does the homepage's cached data). Clearing the tag makes them all refetch on
  // the next request. (/sealed self-refreshes via its own 15-min in-process memo.)
  revalidateTag(CONTENT_TAG);

  return [...staticPaths.map(([p]) => p), `tag:${CONTENT_TAG}`];
}
