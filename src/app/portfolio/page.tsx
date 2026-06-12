import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPortfolio, isPremium } from "@/lib/premium";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { IndexChart } from "@/components/IndexChart";
import { PriceChart } from "@/components/PriceChart";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My portfolio — collection value tracker",
  robots: { index: false, follow: false }, // personal page, never indexed
};

function Delta({ label, pct }: { label: string; pct: number | null }) {
  if (pct == null) return null;
  const up = pct > 0;
  return (
    <div className="rounded-lg bg-ink-900 px-3 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-sm font-extrabold ${pct === 0 ? "text-slate-300" : up ? "text-brand-400" : "text-rose-400"}`}>
        {pct === 0 ? "—" : `${up ? "▲" : "▼"} ${Math.abs(pct)}%`}
      </div>
    </div>
  );
}

export default async function PortfolioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/portfolio");

  const country = getCountry();
  const info = COUNTRIES[country];
  const [portfolio, dbUser] = await Promise.all([
    getPortfolio(user.id, country),
    prisma.user.findUnique({ where: { id: user.id }, select: { premiumUntil: true } }),
  ]);
  const premium = isPremium(dbUser);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-white">💼 My portfolio</h1>
          <p className="mt-1 text-sm text-slate-400">
            Your collection valued at the live {info.adjective} lowest prices, condition-adjusted.
          </p>
        </div>
        {premium ? (
          <span className="chip bg-gold/15 text-xs font-bold text-gold">★ PREMIUM</span>
        ) : (
          <Link href="/premium" className="btn-ghost text-sm">★ Go Premium</Link>
        )}
      </div>

      {portfolio.holdings.length === 0 ? (
        <div className="card-surface grid place-items-center p-14 text-center text-slate-400">
          <div>
            <p className="text-lg font-semibold text-white">No cards in your collection yet</p>
            <p className="mt-1 max-w-md text-sm">
              Add cards from any card page (or the scanner in the app) and your collection&apos;s live
              value — with daily history — appears here.
            </p>
            <Link href="/browse" className="btn-primary mt-4">Browse cards →</Link>
          </div>
        </div>
      ) : (
        <>
          {/* Headline value */}
          <section className="card-surface p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Collection value · {info.code} market
                </div>
                <div className="font-display text-5xl font-extrabold text-white">
                  {formatMoney(portfolio.totalCents, info.currency)}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {portfolio.pricedCount} priced holding{portfolio.pricedCount === 1 ? "" : "s"}
                  {portfolio.unpricedCount > 0 && <> · {portfolio.unpricedCount} awaiting a live price</>}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Delta label="1 day" pct={portfolio.d1} />
                <Delta label="7 days" pct={portfolio.d7} />
                <Delta label="30 days" pct={portfolio.d30} />
              </div>
            </div>

            {/* Value-over-time: the premium hook. Free users see a teaser. */}
            <div className="mt-4">
              {premium ? (
                portfolio.series.length >= 2 ? (
                  <PriceChart points={portfolio.series} currency={info.currency} />
                ) : (
                  <p className="text-sm text-slate-500">
                    Your value history starts charting after a couple of daily price snapshots — check back tomorrow.
                  </p>
                )
              ) : (
                <div className="relative overflow-hidden rounded-xl border border-ink-700">
                  <div className="pointer-events-none select-none opacity-30 blur-[2px]">
                    {portfolio.series.length >= 2 ? (
                      <IndexChart points={portfolio.series.map((p) => ({ t: p.t, v: p.v / 100 }))} />
                    ) : (
                      <div className="h-40" />
                    )}
                  </div>
                  <div className="absolute inset-0 grid place-items-center bg-ink-950/40 p-4 text-center">
                    <div>
                      <p className="text-sm font-bold text-white">📈 Value-over-time is a Premium feature</p>
                      <p className="mt-1 text-xs text-slate-400">Daily history, CSV export, unlimited price alerts and an ad-free site.</p>
                      <Link href="/premium" className="btn-primary mt-3 text-sm">See Premium →</Link>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {premium && (
              <div className="mt-3 text-right">
                <a href="/api/portfolio/export" className="btn-ghost text-xs">⬇ Export CSV</a>
              </div>
            )}
          </section>

          {/* Holdings */}
          <section>
            <h2 className="mb-2 text-lg font-extrabold text-white">Holdings</h2>
            <div className="card-surface overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5 font-semibold">Card</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Qty</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Unit</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Value</th>
                    <th className="px-4 py-2.5 text-right font-semibold">7-day</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-800">
                  {portfolio.holdings.map((h, i) => (
                    <tr key={`${h.cardId}-${h.condition}-${h.isFoil}-${i}`} className="hover:bg-ink-900/50">
                      <td className="px-4 py-2">
                        <Link href={`/card/${h.slug ?? h.cardId}`} className="flex items-center gap-2.5">
                          {h.imageThumbUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={h.imageThumbUrl} alt="" width={28} height={39} loading="lazy" className="h-10 w-7 shrink-0 rounded-sm object-cover" />
                          )}
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-white">{h.name}</span>
                            <span className="block text-[11px] text-slate-500">
                              {h.setCode} · {h.collectorNumber} · {h.condition}{h.isFoil ? " · ✦" : ""}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-right text-slate-300">×{h.quantity}</td>
                      <td className="px-2 py-2 text-right text-slate-300">{h.unitCents != null ? formatMoney(h.unitCents, info.currency) : "—"}</td>
                      <td className="px-2 py-2 text-right font-semibold text-white">{h.valueCents > 0 ? formatMoney(h.valueCents, info.currency) : "—"}</td>
                      <td className={`px-4 py-2 text-right font-semibold ${h.d7pct == null ? "text-slate-600" : h.d7pct > 0 ? "text-brand-400" : h.d7pct < 0 ? "text-rose-400" : "text-slate-400"}`}>
                        {h.d7pct == null ? "—" : `${h.d7pct > 0 ? "▲" : h.d7pct < 0 ? "▼" : ""} ${Math.abs(h.d7pct)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-slate-600">
              Unit prices are the live lowest in-stock store price × the standard condition multiplier
              ({Object.entries({ NM: 1, LP: 0.85, MP: 0.7, HP: 0.55, DMG: 0.4 }).map(([k, v]) => `${k} ${v * 100}%`).join(" · ")}).
            </p>
          </section>
        </>
      )}
    </div>
  );
}
