import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { checkStoreHealth, type StoreHealthRow } from "@/lib/store-health";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Store data health",
  robots: { index: false, follow: false },
};

// checkStoreHealth() also WRITES today's snapshot as a side effect (see
// lib/store-health.ts) — cached here so loading this page repeatedly doesn't
// re-run that write on every request. The cron route calling it directly is
// unaffected; this cache is scoped to this page's reads only.
const loadHealth = unstable_cache(
  async () => {
    try {
      return await checkStoreHealth();
    } catch (e) {
      console.error("[admin/store-health] failed to load:", e);
      return { rows: [] as StoreHealthRow[], alerts: [] };
    }
  },
  ["admin-store-health"],
  { revalidate: 300 },
);

export default async function StoreHealthAdminPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) notFound(); // don't reveal the page exists

  const { rows, alerts } = await loadHealth();
  const alerting = rows.filter((r) => r.alerts.length > 0).sort((a, b) => b.alerts.length - a.alerts.length);
  const healthy = rows.filter((r) => r.alerts.length === 0);
  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold text-white">Store data health</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        Per-store checks against a 7-day trend: no successful fetch in 30h, listings dropped &gt;30% vs the 7-day
        median, a median price frozen for 3+ consecutive days, or a median price 10x above/below its recent baseline
        — the four shapes a silently broken scraper takes, distinguished from a genuinely quiet market. Runs on
        {" "}<code className="rounded bg-ink-800 px-1 text-xs">/api/cron/store-health</code>, posts to Discord only
        when there is something to act on.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Stores tracked" value={fmt(rows.length)} />
        <Stat label="Alerting" value={fmt(alerting.length)} accent={alerting.length > 0} />
        <Stat label="Total alerts" value={fmt(alerts.length)} accent={alerts.length > 0} />
      </div>

      {alerting.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2 text-lg font-bold text-white">Alerting stores</h2>
          <div className="overflow-x-auto rounded-xl border border-rose-500/30 bg-rose-500/[0.04]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">Store</th>
                  <th className="px-3 py-2 font-medium">Market</th>
                  <th className="px-3 py-2 text-right font-medium">Listings</th>
                  <th className="px-3 py-2 font-medium">Alerts</th>
                </tr>
              </thead>
              <tbody>
                {alerting.map((r) => (
                  <tr key={`${r.retailer}|${r.country}`} className="border-b border-ink-800 last:border-0">
                    <td className="px-3 py-2 font-medium text-white">{r.retailerName}</td>
                    <td className="px-3 py-2 text-slate-400">{r.country}</td>
                    <td className="num px-3 py-2 text-right tabular-nums text-slate-300">{fmt(r.listings)}</td>
                    <td className="px-3 py-2">
                      <ul className="space-y-0.5">
                        {r.alerts.map((a, i) => (
                          <li key={i} className="text-xs text-rose-300">{a.detail}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-2 text-lg font-bold text-white">All stores ({healthy.length} healthy)</h2>
        <div className="overflow-x-auto rounded-xl border border-ink-700 bg-ink-850">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-medium">Store</th>
                <th className="px-3 py-2 font-medium">Market</th>
                <th className="px-3 py-2 text-right font-medium">Listings</th>
                <th className="px-3 py-2 text-right font-medium">In stock</th>
                <th className="px-3 py-2 text-right font-medium">7d median</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    No data yet — StoreHealthSnapshot needs at least one cron run.
                  </td>
                </tr>
              ) : (
                rows
                  .slice()
                  .sort((a, b) => b.listings - a.listings)
                  .map((r) => (
                    <tr key={`${r.retailer}|${r.country}`} className="border-b border-ink-800 last:border-0 hover:bg-ink-800/60">
                      <td className="px-3 py-2 font-medium text-slate-300">{r.retailerName}</td>
                      <td className="px-3 py-2 text-slate-500">{r.country}</td>
                      <td className="num px-3 py-2 text-right tabular-nums text-slate-300">{fmt(r.listings)}</td>
                      <td className="num px-3 py-2 text-right tabular-nums text-slate-400">{fmt(r.inStock)}</td>
                      <td className="num px-3 py-2 text-right tabular-nums text-slate-500">
                        {r.medianListings7d != null ? Math.round(r.medianListings7d) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {r.alerts.length > 0 ? (
                          <span className="chip bg-rose-500/15 text-rose-300">{r.alerts.length} alert{r.alerts.length === 1 ? "" : "s"}</span>
                        ) : (
                          <span className="chip bg-up/15 text-up">Healthy</span>
                        )}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-rose-500/30 bg-rose-500/[0.04]" : "border-ink-700 bg-ink-850"}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`num mt-1 text-2xl font-extrabold ${accent ? "text-rose-300" : "text-white"}`}>{value}</div>
    </div>
  );
}
