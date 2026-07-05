import { revalidatePath, revalidateTag } from "next/cache";

// On-demand ISR revalidation, invoked after the daily/twice-daily price import
// writes new data. This is the freshness half of the "don't hammer Neon" strategy:
// the price-derived public pages carry a LONG revalidate (24h) fallback, so their
// ONLY routine refresh trigger is this call — Postgres is read ~twice a day (per
// import) instead of on a short timer. A missed ping just means up-to-24h staleness
// ("Updated daily"), never a stale-forever page.
//
// Must run inside a route handler / server action (request scope) — see
// /api/revalidate and /api/cron/refresh-prices.
export const CONTENT_TAG = "content";

export function revalidateContent(): string[] {
  // ISR pages that read price data directly (not searchParams-dynamic). Passing the
  // dynamic route pattern with `"page"` revalidates EVERY page under that segment
  // (all ~1,200 /card/* URLs at once), which is the whole point.
  const paths: [string, "page"][] = [
    ["/", "page"],
    ["/movers", "page"],
    ["/sealed", "page"],
    ["/card-value", "page"],
    ["/tools/box-ev", "page"],
    ["/domains", "page"],
    ["/decks", "page"],
    ["/card/[id]", "page"],
    ["/sets/[set]", "page"],
    ["/domains/[slug]", "page"],
    ["/decks/[slug]", "page"],
  ];
  for (const [p, type] of paths) revalidatePath(p, type);

  // The sitemap is the crawler's discovery source — refresh so new cards appear.
  revalidatePath("/sitemap.xml");

  // The searchParams-dynamic pages (/market and its JSON/markdown/embed twins)
  // can't be path-revalidated, but their heavy data is behind unstable_cache tagged
  // CONTENT_TAG — clearing the tag refreshes them on the next request.
  revalidateTag(CONTENT_TAG);

  return paths.map(([p]) => p);
}
