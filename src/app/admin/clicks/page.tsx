import type { Metadata } from "next";
import { notFound } from "next/navigation";
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

export default async function ClicksAdminPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) notFound(); // don't reveal the page exists

  const now = Date.now();
  const d7 = new Date(now - 7 * 86400_000);
  const d30 = new Date(now - 30 * 86400_000);

  let rows: Row[] = [];
  let byCountry: { country: string; n: number }[] = [];
  let byKind: { kind: string; n: number }[] = [];
  let recent: ClickRow[] = [];
  let error = false;
  try {
    const [all, last30, last7, country30, kind30, events] = await Promise.all([
      dbHistory.clickEvent.groupBy({ by: ["retailer"], _count: { _all: true } }),
      dbHistory.clickEvent.groupBy({ by: ["retailer"], _count: { _all: true }, where: { createdAt: { gte: d30 } } }),
      dbHistory.clickEvent.groupBy({ by: ["retailer"], _count: { _all: true }, where: { createdAt: { gte: d7 } } }),
      dbHistory.clickEvent.groupBy({ by: ["country"], _count: { _all: true }, where: { createdAt: { gte: d30 } } }),
      dbHistory.clickEvent.groupBy({ by: ["kind"], _count: { _all: true }, where: { createdAt: { gte: d30 } } }),
      dbHistory.clickEvent.findMany({ orderBy: { createdAt: "desc" }, take: 500, select: { retailer: true, country: true, kind: true, path: true, createdAt: true } }),
    ]);
    recent = events.map((e) => ({ retailer: e.retailer, country: e.country, kind: e.kind, path: e.path, createdAt: e.createdAt.toISOString() }));
    const m30 = new Map(last30.map((r) => [r.retailer, r._count._all]));
    const m7 = new Map(last7.map((r) => [r.retailer, r._count._all]));
    rows = all
      .map((r) => ({ retailer: r.retailer, all: r._count._all, d30: m30.get(r.retailer) ?? 0, d7: m7.get(r.retailer) ?? 0 }))
      .sort((a, b) => b.d30 - a.d30 || b.all - a.all);
    byCountry = country30.map((r) => ({ country: r.country, n: r._count._all })).sort((a, b) => b.n - a.n);
    byKind = kind30.map((r) => ({ kind: r.kind, n: r._count._all })).sort((a, b) => b.n - a.n);
  } catch {
    error = true;
  }

  const total = (k: keyof Omit<Row, "retailer">) => rows.reduce((s, r) => s + r[k], 0);
  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-white">Outbound clicks</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        Every &ldquo;View deal&rdquo; / affiliate click we record ourselves (via the click beacon) — independent of any
        partner dashboard. Use it to see which stores actually get clicked and to sanity-check that affiliate tracking
        is live.
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
          {/* Totals */}
          <div className="mt-6 grid grid-cols-3 gap-3">
            <Stat label="Clicks · 7d" value={fmt(total("d7"))} />
            <Stat label="Clicks · 30d" value={fmt(total("d30"))} />
            <Stat label="Clicks · all time" value={fmt(total("all"))} />
          </div>

          {/* Per-store table */}
          <div className="mt-6 overflow-x-auto rounded-xl border border-ink-700 bg-ink-850">
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
                {rows.map((r) => (
                  <tr key={r.retailer} className="border-b border-ink-800 last:border-0 hover:bg-ink-800/60">
                    <td className="px-3 py-2 font-medium text-white">{r.retailer}</td>
                    <td className="num px-3 py-2 text-right tabular-nums text-slate-300">{fmt(r.d7)}</td>
                    <td className="num px-3 py-2 text-right tabular-nums text-slate-300">{fmt(r.d30)}</td>
                    <td className="num px-3 py-2 text-right tabular-nums text-white">{fmt(r.all)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Breakdowns (last 30 days) */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Breakdown title="By market · 30d" items={byCountry.map((r) => ({ k: r.country, n: r.n }))} fmt={fmt} />
            <Breakdown title="By type · 30d" items={byKind.map((r) => ({ k: r.kind, n: r.n }))} fmt={fmt} />
          </div>

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
