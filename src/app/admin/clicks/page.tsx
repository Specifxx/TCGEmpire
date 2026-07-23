import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { dbHistory } from "@/lib/db-history";
import { ClicksTable, type ClickRow } from "@/components/admin/ClicksTable";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Outbound clicks",
  robots: { index: false, follow: false },
};

type Row = { retailer: string; d7: number; d30: number; all: number };
type ClicksData = { rows: Row[]; byCountry: { country: string; n: number }[]; byKind: { kind: string; n: number }[]; recent: ClickRow[] };

// This page used to re-run 5 groupBys + a 500-row findMany against the history DB
// on every single load (force-dynamic, zero caching) — the findMany alone was
// 500 full rows of egress per hit. Diagnostics don't need per-request freshness,
// so cache the whole fetch for a few minutes; the auth check above still runs
// fresh every request (cheap — no DB call).
const loadClicksData = unstable_cache(
  async (): Promise<{ data: ClicksData | null; error: boolean }> => {
    const now = Date.now();
    const d7 = new Date(now - 7 * 86400_000);
    const d30 = new Date(now - 30 * 86400_000);
    try {
      // country30/kind30 are scoped to eBay retailer keys only (retailer LIKE 'ebay%')
      // — this page exists specifically to verify eBay affiliate tracking is live (see
      // the eBay-only beacon in api/click/route.ts), so a breakdown mixing in the
      // decaying pre-cutover Shopify-store rows (see the `rows` comment below) would
      // misrepresent what's actually being tracked going forward.
      const [all, last30, last7, country30, kind30] = await Promise.all([
        dbHistory.clickEvent.groupBy({ by: ["retailer"], _count: { _all: true } }),
        dbHistory.clickEvent.groupBy({ by: ["retailer"], _count: { _all: true }, where: { createdAt: { gte: d30 } } }),
        dbHistory.clickEvent.groupBy({ by: ["retailer"], _count: { _all: true }, where: { createdAt: { gte: d7 } } }),
        dbHistory.clickEvent.groupBy({ by: ["country"], _count: { _all: true }, where: { createdAt: { gte: d30 }, retailer: { startsWith: "ebay" } } }),
        dbHistory.clickEvent.groupBy({ by: ["kind"], _count: { _all: true }, where: { createdAt: { gte: d30 }, retailer: { startsWith: "ebay" } } }),
      ]);
      // The recent-events list selects the newer `path` column — if the click table
      // lives in a history database the schema push hasn't reached yet, degrade to
      // the pathless select instead of failing the whole page.
      let recent: ClickRow[];
      try {
        const events = await dbHistory.clickEvent.findMany({
          orderBy: { createdAt: "desc" },
          take: 500,
          select: { retailer: true, country: true, kind: true, path: true, createdAt: true },
        });
        recent = events.map((e) => ({ retailer: e.retailer, country: e.country, kind: e.kind, path: e.path, createdAt: e.createdAt.toISOString() }));
      } catch (e) {
        console.error("[admin/clicks] recent-events query failed (path column missing on the history DB?):", e);
        const events = await dbHistory.clickEvent.findMany({
          orderBy: { createdAt: "desc" },
          take: 500,
          select: { retailer: true, country: true, kind: true, createdAt: true },
        });
        recent = events.map((e) => ({ retailer: e.retailer, country: e.country, kind: e.kind, path: null, createdAt: e.createdAt.toISOString() }));
      }
      const m30 = new Map(last30.map((r) => [r.retailer, r._count._all]));
      const m7 = new Map(last7.map((r) => [r.retailer, r._count._all]));
      // Every retailer key we've ever recorded a click for. Only "ebay*" keys are
      // still LIVE (see api/click/route.ts) — every other retailer's rows are
      // historical leftovers from before 2026-07-21, still showing up in d7/d30
      // for a few more weeks until they age out of that window. Kept in the table
      // (renamed "historical") for reference, but never mixed into the headline
      // stats or the country/kind breakdowns above, which exist to answer one
      // question: is eBay tracking actually working right now.
      const rows = all
        .map((r) => ({ retailer: r.retailer, all: r._count._all, d30: m30.get(r.retailer) ?? 0, d7: m7.get(r.retailer) ?? 0 }))
        .sort((a, b) => b.d30 - a.d30 || b.all - a.all);
      const byCountry = country30.map((r) => ({ country: r.country, n: r._count._all })).sort((a, b) => b.n - a.n);
      const byKind = kind30.map((r) => ({ kind: r.kind, n: r._count._all })).sort((a, b) => b.n - a.n);
      return { data: { rows, byCountry, byKind, recent }, error: false };
    } catch (e) {
      console.error("[admin/clicks] failed to load click data:", e);
      return { data: null, error: true };
    }
  },
  ["admin-clicks-data"],
  { revalidate: 300 }
);

export default async function ClicksAdminPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) notFound(); // don't reveal the page exists

  const { data, error } = await loadClicksData();
  const rows = data?.rows ?? [];
  const byCountry = data?.byCountry ?? [];
  const byKind = data?.byKind ?? [];
  const recent = data?.recent ?? [];

  // Only "ebay*" retailer keys are still LIVE (see api/click/route.ts's eBay-only
  // beacon guard) — everything else is a historical leftover from before that
  // 2026-07-21 cutoff, still surfacing in d7/d30 until those old rows age out.
  // Headline totals use eBay rows ONLY, since that's what this page exists to
  // verify; the full table (including historical rows) stays below for reference.
  const ebayRows = rows.filter((r) => r.retailer.startsWith("ebay"));
  const otherRows = rows.filter((r) => !r.retailer.startsWith("ebay"));
  const total = (rs: Row[], k: keyof Omit<Row, "retailer">) => rs.reduce((s, r) => s + r[k], 0);
  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-white">Outbound clicks (historical)</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        The click beacon itself was switched off on 2026-07-23 to cut history-DB network-transfer usage — nothing
        below this date is being recorded anymore, for eBay or any other retailer. Everything on this page is
        historical: it stops growing and will simply fade out of the 7d/30d columns over the next few weeks. Non-eBay
        store clicks had already stopped being logged on 2026-07-21, before the beacon was disabled entirely.
      </p>

      {error ? (
        <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
          Couldn&apos;t load click data right now.
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
          No clicks recorded yet.
        </div>
      ) : (
        <>
          {/* Totals — eBay only, since that's the one thing still live-tracked */}
          <div className="mt-6 grid grid-cols-3 gap-3">
            <Stat label="eBay clicks · 7d" value={fmt(total(ebayRows, "d7"))} />
            <Stat label="eBay clicks · 30d" value={fmt(total(ebayRows, "d30"))} />
            <Stat label="eBay clicks · all time" value={fmt(total(ebayRows, "all"))} />
          </div>

          {/* eBay per-context table (search, deal finder, arbitrage, ads, etc.) */}
          <div className="mt-6 overflow-x-auto rounded-xl border border-ink-700 bg-ink-850">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">eBay context</th>
                  <th className="px-3 py-2 text-right font-medium">7d</th>
                  <th className="px-3 py-2 text-right font-medium">30d</th>
                  <th className="px-3 py-2 text-right font-medium">All time</th>
                </tr>
              </thead>
              <tbody>
                {ebayRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-slate-500">No eBay clicks recorded yet.</td>
                  </tr>
                ) : (
                  ebayRows.map((r) => (
                    <tr key={r.retailer} className="border-b border-ink-800 last:border-0 hover:bg-ink-800/60">
                      <td className="px-3 py-2 font-medium text-white">{r.retailer}</td>
                      <td className="num px-3 py-2 text-right tabular-nums text-slate-300">{fmt(r.d7)}</td>
                      <td className="num px-3 py-2 text-right tabular-nums text-slate-300">{fmt(r.d30)}</td>
                      <td className="num px-3 py-2 text-right tabular-nums text-white">{fmt(r.all)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Breakdowns (last 30 days, eBay only) */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Breakdown title="eBay clicks by market · 30d" items={byCountry.map((r) => ({ k: r.country, n: r.n }))} fmt={fmt} />
            <Breakdown title="eBay clicks by type · 30d" items={byKind.map((r) => ({ k: r.kind, n: r.n }))} fmt={fmt} />
          </div>

          {/* Historical — every other retailer, no longer tracked. Kept only so old
              affiliate-outreach numbers aren't lost; will empty out as rows age past
              30/90 days (see the notification/history pruning cron for the pattern). */}
          {otherRows.length > 0 && (
            <details className="mt-6 rounded-xl border border-ink-700 bg-ink-850">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-300 hover:text-white">
                Historical — other retailers, no longer tracked ({otherRows.length})
              </summary>
              <div className="overflow-x-auto border-t border-ink-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-medium">Store</th>
                      <th className="px-3 py-2 text-right font-medium">7d</th>
                      <th className="px-3 py-2 text-right font-medium">30d</th>
                      <th className="px-3 py-2 text-right font-medium">All time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otherRows.map((r) => (
                      <tr key={r.retailer} className="border-b border-ink-800 last:border-0 hover:bg-ink-800/60">
                        <td className="px-3 py-2 font-medium text-slate-300">{r.retailer}</td>
                        <td className="num px-3 py-2 text-right tabular-nums text-slate-500">{fmt(r.d7)}</td>
                        <td className="num px-3 py-2 text-right tabular-nums text-slate-500">{fmt(r.d30)}</td>
                        <td className="num px-3 py-2 text-right tabular-nums text-slate-400">{fmt(r.all)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {/* Individual clicks — which store, which page (card/product), which market,
              and when. Sortable by any column, filterable. */}
          <div className="mt-8">
            <h2 className="mb-2 text-lg font-bold text-white">Recent clicks</h2>
            <p className="mb-3 text-xs text-slate-500">
              The last {recent.length.toLocaleString()} outbound clicks. Click a column heading to sort (▲▼). The
              &ldquo;page&rdquo; is the card/product the visitor clicked from (only recorded for clicks after this
              shipped).
            </p>
            <ClicksTable events={recent} />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="num mt-1 text-2xl font-extrabold text-white">{value}</div>
    </div>
  );
}

function Breakdown({ title, items, fmt }: { title: string; items: { k: string; n: number }[]; fmt: (n: number) => string }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      {items.length === 0 ? (
        <div className="text-sm text-slate-600">—</div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.k} className="flex items-center justify-between text-sm">
              <span className="text-slate-300">{i.k}</span>
              <span className="num tabular-nums text-white">{fmt(i.n)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
