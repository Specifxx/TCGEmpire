import { dbHistory } from "@/lib/db-history";
import { DEMAND_ROUTES, loadItemDemand } from "@/lib/analytics/item-demand";
import { pool } from "@/lib/analytics/vercel";
import { SITES } from "./sites";
import { topOf, type ClickSite, type TopClicks } from "./top-items";

export type { ClickItem, ClickSite, TopClicks } from "./top-items";
export { itemLabel, topClickedOverall, topOf } from "./top-items";
import { readStored, writeStored } from "./stored";

// THE MOST-CLICKED ITEMS ON EVERY SITE (2026-11-25, beside the sales in
// lib/earnings/top-items.ts). A buy click is a visitor leaving for a store: a sign
// of demand, not a sale, and the page and the report say so.
//   • every sister site: its `buy_product` events by product, from Vercel's Web
//     Analytics (lib/analytics/item-demand.ts, the same read /api/demand/<site>
//     makes); a site that sends no such event shows its most-viewed product pages,
//     labelled as views;
//   • RiftCompare: its own ClickEvent rows by the page the click came from.
// Refreshed by the earnings-refresh cron at most once every 20 hours (about 100
// analytics queries); counts only, nothing about a visitor.

const siteLabel = (key: string) => SITES.find((s) => s.key === key)?.label ?? key.toUpperCase();

export const TOP_CLICKS_KEY = "top-clicks";
const REFRESH_MS = 20 * 3600_000;

async function riftClicks(): Promise<ClickSite> {
  const base = { site: "rc", label: siteLabel("rc"), kind: "clicks" as const };
  try {
    const now = Date.now();
    const count = (days: number) =>
      dbHistory.clickEvent.groupBy({
        by: ["path"],
        where: { createdAt: { gte: new Date(now - days * 86400_000) }, path: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { path: "desc" } },
        take: 100,
      });
    const [g28, g7] = await Promise.all([count(28), count(7)]);
    const m: Record<string, [number, number]> = {};
    for (const r of g28) if (r.path) m[r.path] = [r._count._all, 0];
    for (const r of g7) if (r.path) m[r.path] = [m[r.path]?.[0] ?? r._count._all, r._count._all];
    return { ...base, status: "ok", items: topOf(m) };
  } catch (e) {
    console.error("[top-clicks] rift clicks failed:", e);
    return { ...base, status: "error", items: [] };
  }
}

export async function refreshTopClicks(): Promise<TopClicks> {
  const sisters = Object.keys(DEMAND_ROUTES).filter((s) => s !== "rc");
  const rows = await pool(sisters, 3, async (site): Promise<ClickSite> => {
    const label = siteLabel(site);
    try {
      const d = await loadItemDemand(site);
      const clicks = topOf(d.clicks);
      return clicks.length
        ? { site, label, status: d.status, kind: "clicks", items: clicks }
        : { site, label, status: d.status, kind: "views", items: topOf(d.views, 10) };
    } catch {
      return { site, label, status: "error", kind: "clicks", items: [] };
    }
  });
  return { fetchedAt: Date.now(), sites: [await riftClicks(), ...rows] };
}

export async function loadTopClicks(): Promise<TopClicks | null> {
  return (await readStored<TopClicks>([TOP_CLICKS_KEY])).get(TOP_CLICKS_KEY) ?? null;
}

/** For the refresh cron: refresh when the kept copy is 20 hours old; a refresh that read nothing never replaces a good copy. */
export async function storeTopClicks(now = Date.now()): Promise<{ status: "ok" | "kept" | "error" }> {
  const kept = await loadTopClicks().catch(() => null);
  if (kept && now - kept.fetchedAt < REFRESH_MS) return { status: "kept" };
  const fresh = await refreshTopClicks();
  if (!fresh.sites.some((s) => s.items.length)) return { status: kept ? "kept" : "error" };
  await writeStored(TOP_CLICKS_KEY, fresh);
  return { status: "ok" };
}
