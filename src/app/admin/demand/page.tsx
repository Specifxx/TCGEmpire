import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { dbHistory } from "@/lib/db-history";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { normalizeCountry, pickPrice, currencyOf, COUNTRY_LIST } from "@/lib/country";

export const dynamic = "force-dynamic";

// Keep this page out of search engines.
export const metadata: Metadata = {
  title: "Demand",
  robots: { index: false, follow: false },
};

const TOP_N = 50;
const RECENT_DAYS = 30;

// Demand leaderboard for sourcing/flipping decisions. Surfaces the popularity signals
// the app already records — searchCount (clicks from the search box, the purest demand
// metric) and viewCount (any open) — plus outbound affiliate clicks by retailer.
//
// Access is admin-only: a logged-in account with isAdmin, or the ADMIN_TOKEN env var
// (visit /admin/demand?key=YOUR_TOKEN). Mirrors /admin/messages so there's one gate.
export default async function AdminDemandPage({
  searchParams,
}: {
  searchParams: { key?: string; country?: string };
}) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  const authed = keyOk || !!user?.isAdmin;

  // Don't reveal the page exists to anyone without access.
  if (!authed) notFound();

  const country = normalizeCountry(searchParams.country);
  const currency = currencyOf(country);

  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);

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
    lowestPriceCentsNz: true,
    lowestPriceCentsUs: true,
    lowestPriceCentsUk: true,
  } as const;

  const [topSearched, topViewed, clicksRecent, clicksAll] = await Promise.all([
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
    dbHistory.clickEvent.groupBy({
      by: ["retailer"],
      where: { country, createdAt: { gte: since } },
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
            <th className="px-3 py-2 text-right font-medium">Searches</th>
            <th className="px-3 py-2 text-right font-medium">Views</th>
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
              <td
                className={`px-3 py-2 text-right tabular-nums ${
                  metric === "searchCount" ? "font-semibold text-white" : "text-slate-400"
                }`}
              >
                {num.format(c.searchCount)}
              </td>
              <td
                className={`px-3 py-2 text-right tabular-nums ${
                  metric === "viewCount" ? "font-semibold text-white" : "text-slate-400"
                }`}
              >
                {num.format(c.viewCount)}
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
            const params = new URLSearchParams();
            if (searchParams.key) params.set("key", searchParams.key);
            if (c.code !== "AU") params.set("country", c.code);
            const qs = params.toString();
            return (
              <Link
                key={c.code}
                href={`/admin/demand${qs ? `?${qs}` : ""}`}
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

      <section className="mb-10">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-white">Most searched</h2>
          <span className="text-xs text-slate-500">
            purest demand signal · top {TOP_N}
          </span>
        </div>
        {topSearched.length === 0 ? (
          <Empty>No search activity recorded yet.</Empty>
        ) : (
          <CardTable rows={topSearched} metric="searchCount" />
        )}
      </section>

      <section className="mb-10">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-white">Most viewed</h2>
          <span className="text-xs text-slate-500">all opens, incl. featured · top {TOP_N}</span>
        </div>
        {topViewed.length === 0 ? (
          <Empty>No views recorded yet.</Empty>
        ) : (
          <CardTable rows={topViewed} metric="viewCount" />
        )}
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-white">Outbound clicks by store</h2>
          <span className="text-xs text-slate-500">
            {country} · buy-intent · last {RECENT_DAYS}d &amp; all-time
          </span>
        </div>
        {clickRows.length === 0 ? (
          <Empty>No outbound clicks recorded for {country} yet.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink-700 bg-ink-850">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">Store</th>
                  <th className="px-3 py-2 text-right font-medium">Last {RECENT_DAYS}d</th>
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
