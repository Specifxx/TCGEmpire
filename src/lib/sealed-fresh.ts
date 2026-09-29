import { revalidateTag } from "next/cache";
import { CONTENT_TAG } from "./revalidate-content";

// A FRESH READ OF THE SEALED GROUPS FOR THE PAID ALERT RUN (2026-09-29).
//
// getSealedGroups(market) is served from a 48h Data Cache entry tagged
// CONTENT_TAG plus a 15-minute in-process memo, and the only thing that
// refreshes it after an import is the workflow's "Revalidate site pages" step —
// which deliberately SKIPS the 07:00 UTC run whenever a deploy is pending (the
// 08:00 release rebuilds the page cache, so purging first would be wasted ISR
// writes; refresh-prices.yml). On those days the sealed watch pass would price
// the previous evening's listings: a restock, RRP or price signal delayed by a
// run, and emailed with a "checked ~14h ago" label.
//
// The workflow therefore passes ?fresh=1 to /api/cron/price-alerts/paid ONLY
// when it did not purge, and the route calls this before the sealed pass reads.
// It orphans the Data Cache entries tagged CONTENT_TAG (no revalidatePath, so
// no page purge and no prerender: pages that read them refill on their next
// request) and empties this instance's memo, so the loader that follows —
// still getSealedGroups, called directly, never wrapped — reads the listings
// the sealed import just wrote. The importer's own module is left alone; a
// sealed-specific tag would narrow the purge and is the natural next step.
export function bustSealedGroups(): void {
  revalidateTag(CONTENT_TAG);
  (globalThis as unknown as { __sealedGroups?: Map<string, unknown> }).__sealedGroups?.clear();
}
