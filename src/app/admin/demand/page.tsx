import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { dbHistory } from "@/lib/db-history";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { normalizeCountry, pickPrice, currencyOf, COUNTRY_LIST } from "@/lib/country";
import { getDemandWindow } from "@/lib/demand-snapshot";

export const dynamic = "force-dynamic";

// Keep this page out of search engines.
export const metadata: Metadata = {
  title: "Demand",
  robots: { index: false, follow: false },
};

const TOP_N = 50;

// Selectable time window. `days: null` = all time (no filtering at all).
//
// The two data sources behind this page window DIFFERENTLY, and the UI says so
// rather than pretending otherwise:
//   • Outbound clicks are individual ClickEvent rows with a createdAt — filtering
//     them is exact, to the second.
//   • Searches/views are CUMULATIVE counters on Card with no per-event log, so a
//     window is a subtraction against DemandSnapshot's daily rows (see
//     lib/demand-snapshot.ts). That makes them daily-resolution and dependent on
//     how far back snapshots actually reach.
const RANGES = [
  { key: "24h", label: "24h", days: 1 },
  { key: "3d", label: "3 days", days: 3 },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "all", label: "All time", days: null },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];
const DEFAULT_RANGE: RangeKey = "30d";

// Demand leaderboard for sourcing/flipping decisions. Surfaces the popularity signals
// the app already records — searchCount (clicks from the search box, the purest demand
// metric) and viewCount (any open) — plus outbound affiliate clicks by retailer.
//
// Access is admin-only: a logged-in account with isAdmin, or the ADMIN_TOKEN env var
// (visit /admin/demand?key=YOUR_TOKEN). Mirrors /admin/messages so there's one gate.
export default async function AdminDemandPage({
  searchParams,
}: {
  searchParams: { key?: string; country?: string; range?: string };
}) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  const authed = keyOk || !!user?.isAdmin;

  // Don't reveal the page exists to anyone without access.
  if (!authed) notFound();

  const country = normalizeCountry(searchParams.country);
  const currency = currencyOf(country);

  const range = RANGES.find((r) => r.key === searchParams.range) ?? RANGES.find((r) => r.key === DEFAULT_RANGE)!;
  const since = range.days != null ? new Date(Date.now() - range.days * 24 * 60 * 60 * 1000) : null;

  const cardSelect = {
    id: true,
    slug: true,
    name: true,
    setCode: true,
    collectorNumber: true,
    searchCount: true,
    viewCount: true,
    lastViewedAt: true,
    lowestPriceCents: true,
    lowestPriceCentsUs: true,
    lowestPriceCentsUk: true,
    lowestPriceCentsSg: true,
    lowestPriceCentsCa: true,
    lowestPriceCentsEu: true,
  } as const;

  // ── Searches / views, windowed ──────────────────────────────────────────────
  // All-time is a straight ORDER BY on the cumulative counters. A window is a
  // diff against DemandSnapshot (see lib/demand-snapshot.ts) — so the numbers
  // shown are activity INSIDE the window, and `demandWindow` carries the coverage
  // facts the UI needs to caption them truthfully.
  async function fetchCards(ids: string[]) {
    return prisma.card.findMany({ where: { id: { in: ids } }, select: cardSelect });
  }

  const demandWindow = range.days != null ? await getDemandWindow(range.days) : null;
  // A window was asked for but no snapshot reaches back that far — fall back to
  // cumulative and SAY SO in the UI rather than mislabel all-time as "last 7 days".
  const windowUsable = !!demandWindow && demandWindow.baselineDay != null && demandWindow.rows.length > 0;

  let topSearched: Awaited<ReturnType<typeof fetchCards>>;
  let topViewed: Awaited<ReturnType<typeof fetchCards>>;
  // cardId -> in-window counts, for rendering the windowed numbers.
  const inWindow = new Map<string, { searches: number; views: number }>();

  if (windowUsable && demandWindow) {
    for (const r of demandWindow.rows) inWindow.set(r.cardId, { searches: r.searches, views: r.views });
    const bySearch = [...demandWindow.rows].sort((a, b) => b.searches - a.searches || b.views - a.views).slice(0, TOP_N);
    const byView = [...demandWindow.rows].sort((a, b) => b.views - a.views || b.searches - a.searches).slice(0, TOP_N);
    // One fetch for the union, then re-split — the two lists overlap heavily.
    const cards = await fetchCards([...new Set([...bySearch, ...byView].map((r) => r.cardId))]);
    const byId = new Map(cards.map((c) => [c.id, c]));
    topSearched = bySearch.map((r) => byId.get(r.cardId)).filter((c): c is (typeof cards)[number] => !!c);
    topViewed = byView.map((r) => byId.get(r.cardId)).filter((c): c is (typeof cards)[number] => !!c);
  } else {
    [topSearched, topViewed] = await Promise.all([
      prisma.card.findMany({
        where: { searchCount: { gt: 0 } },
        orderBy: [{ searchCount: "desc" }, { viewCount: "desc" }],
        take: TOP_N,
        select: cardSelect,
      }),
      prisma.card.findMany({
        where: { viewCount: { gt: 0 } },
        orderBy: [{ viewCount: "desc" }, { searchCount: "desc" }],
        take: TOP_N,
        select: cardSelect,
      }),
    ]);
  }

  // Clicks live on the separate history database (see lib/db-history.ts) — if it's
  // unreachable or a schema push hasn't landed there yet, degrade to an empty click
  // section instead of crashing the whole page (mirrors /admin/clicks' own guard).
  type ClickGroup = { retailer: string; _count: { _all: number } };
  let clicksRecent: ClickGroup[] = [];
  let clicksAll: ClickGroup[] = [];
  let clicksError = false;
  try {
    [clicksRecent, clicksAll] = await Promise.all([
      dbHistory.clickEvent.groupBy({
        by: ["retailer"],
        // Exact windowing — ClickEvent is one row per click with a real timestamp,
        // unlike the cumulative card counters above. `since` is null for all-time,
        // in which case this collapses to the same query as clicksAll (both
        // columns then show the same figure, which is the honest answer).
        where: { country, ...(since ? { createdAt: { gte: since } } : {}) },
        _count: { _all: true },
        orderBy: { _count: { retailer: "desc" } },
      }),
      dbHistory.clickEvent.groupBy({
        by: ["retailer"],
        where: { country },
        _count: { _all: true },
        orderBy: { _count: { retailer: "desc" } },
      }),
    ]);
  } catch (e) {
    console.error("[admin/demand] failed to load click data:", e);
    clicksError = true;
  }

  const num = new Intl.NumberFormat("en-AU");
  const dateFmt = new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeZone: "Australia/Sydney",
  });

  // Merge recent + all-time click counts into one retailer table.
  const recentByRetailer = new Map(clicksRecent.map((r) => [r.retailer, r._count._all]));
  const clickRows = clicksAll
    .map((r) => ({
      retailer: r.retailer,
      recent: recentByRetailer.get(r.retailer) ?? 0,
      total: r._count._all,
    }))
    .sort((a, b) => b.recent - a.recent || b.total - a.total);
  const totalClicksRecent = clickRows.reduce((s, r) => s + r.recent, 0);
  const totalClicksAll = clickRows.reduce((s, r) => s + r.total, 0);

  const priceOf = (c: (typeof topSearched)[number]) => {
    const cents = pickPrice(c, country);
    return cents != null ? formatMoney(cents, currency) : "—";
  };

  // Preserve the admin key + both filters across every link on the page.
  function hrefFor(next: { country?: string; range?: string }) {
    const params = new URLSearchParams();
    if (searchParams.key) params.set("key", searchParams.key);
    const c = next.country ?? country;
    if (c !== "AU") params.set("country", c);
    const r = next.range ?? range.key;
    if (r !== DEFAULT_RANGE) params.set("range", r);
    const qs = params.toString();
    return `/admin/demand${qs ? `?${qs}` : ""}`;
  }

  const CardTable = ({
    rows,
    metric,
  }: {
    rows: typeof topSearched;
    metric: "searchCount" | "viewCount";
  }) => (
    <div className="overflow-x-auto rounded-xl border border-ink-700 bg-ink-850">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Card</th>
            <th className="px-3 py-2 text-right font-medium">
              Searches{windowUsable && <span className="ml-1 normal-case text-slate-600">in window</span>}
            </th>
            <th className="px-3 py-2 text-right font-medium">
              Views{windowUsable && <span className="ml-1 normal-case text-slate-600">in window</span>}
            </th>
            <th className="px-3 py-2 text-right font-medium">Lowest ({currency})</th>
            <th className="px-3 py-2 text-right font-medium">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={c.id} className="border-b border-ink-800 last:border-0 hover:bg-ink-800/60">
              <td className="px-3 py-2 text-slate-500">{i + 1}</td>
              <td className="px-3 py-2">
                <Link
                  href={`/card/${c.slug ?? c.id}`}
                  className="font-medium text-white hover:text-brand-400"
                >
                  {c.name}
                </Link>
                <div className="text-xs text-slate-500">
                  {c.setCode} · {c.collectorNumber}
                </div>
              </td>
              {/* In a usable window these are the IN-WINDOW deltas, with the
                  cumulative all-time total shown underneath for context. */}
              <td
                className={`px-3 py-2 text-right tabular-nums ${
                  metric === "searchCount" ? "font-semibold text-white" : "text-slate-400"
                }`}
              >
                {num.format(windowUsable ? (inWindow.get(c.id)?.searches ?? 0) : c.searchCount)}
                {windowUsable && (
                  <div className="text-[11px] font-normal text-slate-600">
                    {num.format(c.searchCount)} all-time
                  </div>
                )}
              </td>
              <td
                className={`px-3 py-2 text-right tabular-nums ${
                  metric === "viewCount" ? "font-semibold text-white" : "text-slate-400"
                }`}
              >
                {num.format(windowUsable ? (inWindow.get(c.id)?.views ?? 0) : c.viewCount)}
                {windowUsable && (
                  <div className="text-[11px] font-normal text-slate-600">
                    {num.format(c.viewCount)} all-time
                  </div>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-300">{priceOf(c)}</td>
              <td className="px-3 py-2 text-right text-xs text-slate-500">
                {c.lastViewedAt ? dateFmt.format(c.lastViewedAt) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Demand leaderboard</h1>
          <p className="text-sm text-slate-400">
            What people are searching, viewing and clicking through to buy. Use it to decide
            what&apos;s worth sourcing.
          </p>
        </div>
        {/* Country affects price display + the outbound-click breakdown. */}
        <div className="flex gap-1 rounded-lg border border-ink-700 bg-ink-850 p-1">
          {COUNTRY_LIST.map((c) => {
            const active = c.code === country;
            return (
              <Link
                key={c.code}
                href={hrefFor({ country: c.code, range: range.key })}
                className={`rounded-md px-2.5 py-1 text-sm ${
                  active ? "bg-brand-500 font-medium text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {c.flag} {c.code}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Time window. Applies to every section below. */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-slate-500">Window</span>
        <div className="flex flex-wrap gap-1 rounded-lg border border-ink-700 bg-ink-850 p-1">
          {RANGES.map((r) => {
            const active = r.key === range.key;
            return (
              <Link
                key={r.key}
                href={hrefFor({ country, range: r.key })}
                className={`rounded-md px-2.5 py-1 text-sm ${
                  active ? "bg-brand-500 font-medium text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {r.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Say plainly what the card numbers below actually measure. The two data
          sources window differently and one of them can silently fall short, so
          this is a correctness statement, not decoration. */}
      {range.days != null && (
        <div
          className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
            windowUsable
              ? "border-ink-700 bg-ink-850 text-slate-400"
              : "border-amber-500/30 bg-amber-500/[0.06] text-amber-200/90"
          }`}
        >
          {windowUsable && demandWindow ? (
            <>
              Searches and views show activity in the{" "}
              <span className="font-semibold text-white">last {demandWindow.coveredDays} day{demandWindow.coveredDays === 1 ? "" : "s"}</span>
              , measured against the daily snapshot from{" "}
              <span className="tabular-nums">{dateFmt.format(demandWindow.baselineDay!)}</span>.
              {demandWindow.coveredDays !== range.days && (
                <> You asked for {range.days} days; that&apos;s the closest snapshot available.</>
              )}{" "}
              <span className="text-slate-500">
                Card counters are cumulative with no per-event log, so they can only be windowed to
                daily resolution. Outbound clicks below are exact.
              </span>
            </>
          ) : (
            <>
              <span className="font-semibold">Showing all-time searches and views.</span>{" "}
              {demandWindow && demandWindow.totalDays === 0
                ? "No daily demand snapshots exist yet — they're written by the daily price import, so a window becomes available once two have run."
                : `Daily snapshots only go back ${demandWindow?.totalDays ?? 0} day${demandWindow?.totalDays === 1 ? "" : "s"}, which doesn't cover a ${range.days}-day window.`}{" "}
              Outbound clicks below are still windowed exactly.
            </>
          )}
        </div>
      )}

      <section className="mb-10">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-white">Most searched</h2>
          <span className="text-xs text-slate-500">
            purest demand signal · {windowUsable ? `last ${range.label}` : "all time"} · top {TOP_N}
          </span>
        </div>
        {topSearched.length === 0 ? (
          <Empty>
            {windowUsable
              ? `No search activity in the last ${range.label}.`
              : "No search activity recorded yet."}
          </Empty>
        ) : (
          <CardTable rows={topSearched} metric="searchCount" />
        )}
      </section>

      <section className="mb-10">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-white">Most viewed</h2>
          <span className="text-xs text-slate-500">
            all opens, incl. featured · {windowUsable ? `last ${range.label}` : "all time"} · top {TOP_N}
          </span>
        </div>
        {topViewed.length === 0 ? (
          <Empty>
            {windowUsable ? `No views in the last ${range.label}.` : "No views recorded yet."}
          </Empty>
        ) : (
          <CardTable rows={topViewed} metric="viewCount" />
        )}
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-white">Outbound clicks by store</h2>
          <span className="text-xs text-slate-500">
            {country} · buy-intent · {range.days != null ? `last ${range.label}` : "all time"} &amp; all-time
          </span>
        </div>
        {clicksError ? (
          <Empty>Couldn&apos;t load click data right now.</Empty>
        ) : clickRows.length === 0 ? (
          <Empty>No outbound clicks recorded for {country} yet.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink-700 bg-ink-850">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">Store</th>
                  <th className="px-3 py-2 text-right font-medium">
                    {range.days != null ? `Last ${range.label}` : "All time"}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">All-time</th>
                </tr>
              </thead>
              <tbody>
                {clickRows.map((r) => (
                  <tr key={r.retailer} className="border-b border-ink-800 last:border-0 hover:bg-ink-800/60">
                    <td className="px-3 py-2 font-medium text-white">{r.retailer}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                      {num.format(r.recent)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {num.format(r.total)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-ink-800/40 font-semibold text-white">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num.format(totalClicksRecent)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num.format(totalClicksAll)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Clicks are logged per store, not per card, so they show which markets/stores convert —
          pair them with the searched/viewed cards above to decide what to flip.
        </p>
      </section>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-10 text-center text-slate-400">
      {children}
    </div>
  );
}
