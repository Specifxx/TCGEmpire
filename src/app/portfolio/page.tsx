import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPortfolio, isPremium, PORTFOLIO_FREE, type Portfolio } from "@/lib/premium";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense";
import { formatMoney } from "@/lib/format";
import { IndexChart } from "@/components/IndexChart";
import { PriceChart } from "@/components/PriceChart";
import { MyCollection } from "@/components/MyCollection";
import { CollectionShare } from "@/components/CollectionShare";
import { HoldingsGrid } from "@/components/HoldingsGrid";
import { PremiumButton } from "@/components/PremiumButton";

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

const pctText = (p: number | null) => (p == null ? "—" : `${p > 0 ? "+" : ""}${p}%`);
const pctClass = (p: number | null) => (p == null || p === 0 ? "text-slate-300" : p > 0 ? "text-brand-400" : "text-rose-400");

// The Premium "investor" panel: cost-basis P&L over the tracked windows.
function PnlView({
  pnl,
  currency,
}: {
  pnl: NonNullable<Portfolio["pnl"]>;
  currency: string;
}) {
  return (
    <div className="mt-3 space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Invested" value={formatMoney(pnl.investedCents, currency)} />
        <Stat label="Current value" value={formatMoney(pnl.valueCents, currency)} />
        <Stat label="Profit / loss" value={`${pnl.plCents >= 0 ? "+" : "−"}${formatMoney(Math.abs(pnl.plCents), currency)}`} cls={pctClass(pnl.plCents)} />
        <Stat label="Return" value={pctText(pnl.plPct)} cls={pctClass(pnl.plPct)} />
      </div>
      <p className="text-[11px] text-slate-600">
        P&amp;L covers the {pnl.costedRows} holding{pnl.costedRows === 1 ? "" : "s"} you&apos;ve recorded a purchase price for. Add a
        &quot;paid&quot; price on any card in <a href="#collection" className="text-brand-400 hover:underline">My Collection</a> to include it.
      </p>
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-lg bg-ink-900 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-base font-extrabold ${cls ?? "text-white"}`}>{value}</div>
    </div>
  );
}

export default async function PortfolioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/portfolio");

  const country = getCountry();
  const info = COUNTRIES[country];
  const portfolio = await getPortfolio(user.id, country);
  const premium = isPremium(user); // session user carries premiumUntil + isAdmin
  // Portfolio analytics are free for now (PORTFOLIO_FREE); `pro` gates the
  // value-history chart, P&L panel and CSV export so re-gating is one flag.
  // ADSENSE REVIEW MODE also lifts the gate here. This page is noindex (it is a
  // personal account view), but "noindex" is not "unreachable" — an AdSense
  // reviewer following links from the header lands on it, and blurred panels
  // read as a paywall wherever they appear. The two blurred Premium previews
  // below render as real content while the flag is on.
  const pro = premium || PORTFOLIO_FREE || ADSENSE_REVIEW_MODE;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-white">💼 My portfolio</h1>
          <p className="mt-1 text-sm text-slate-400">
            Your collection valued at the live {info.adjective} lowest prices, condition-adjusted.
          </p>
        </div>
        {premium && <span className="chip bg-gold/15 text-xs font-bold text-gold">★ PREMIUM</span>}
      </div>

      {portfolio.holdings.length > 0 && (
        <>
          {/* Headline value */}
          <section className="card-surface overflow-hidden bg-gradient-to-br from-brand-600/15 via-ink-850 to-gold/10 p-5">
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

            {/* Value-over-time (free for now via PORTFOLIO_FREE). */}
            <div className="mt-4">
              {pro ? (
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
                      <div className="mt-3"><PremiumButton /></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {pro && (
              <div className="mt-3 text-right">
                <a href="/api/portfolio/export" className="btn-ghost text-xs">⬇ Export CSV</a>
              </div>
            )}
          </section>

          {/* Cost-basis P&L + market benchmark — the investor view. */}
          <section className="card-surface p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold text-white">📊 Profit &amp; Loss</h2>
            </div>
            {pro ? (
              portfolio.pnl ? (
                <PnlView pnl={portfolio.pnl} currency={info.currency} />
              ) : (
                <p className="mt-2 text-sm text-slate-400">
                  Record what you paid for a card (the <strong className="text-slate-200">paid</strong> field in My Collection below) and
                  your profit/loss appears here.
                </p>
              )
            ) : (
              <div className="relative mt-3 overflow-hidden rounded-xl border border-ink-700">
                <div aria-hidden className="pointer-events-none select-none p-1 opacity-30 blur-[3px]">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {["Invested", "Current value", "Profit / loss", "Return"].map((l) => (
                      <div key={l} className="rounded-lg bg-ink-900 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-slate-500">{l}</div>
                        <div className="text-base font-extrabold text-white">{formatMoney(12345, info.currency)}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="absolute inset-0 grid place-items-center bg-ink-950/40 p-4 text-center">
                  <div>
                    <p className="text-sm font-bold text-white">💰 Profit &amp; Loss is a Premium feature</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Record what you paid, see your real gains, and track your collection against the market.
                    </p>
                    <Link href="/premium" className="btn-primary mt-3 text-sm">See Premium →</Link>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Your cards — a visual showcase, dearest first. */}
          <section>
            <div className="mb-3 flex items-end justify-between gap-2">
              <h2 className="text-lg font-extrabold text-white">Your cards</h2>
              <span className="text-xs text-slate-500">{portfolio.holdings.length} {portfolio.holdings.length === 1 ? "entry" : "entries"} · dearest first</span>
            </div>
            <HoldingsGrid holdings={portfolio.holdings} currency={info.currency} />
            <p className="mt-3 text-[11px] text-slate-600">
              Values are the live lowest in-stock store price × the standard condition multiplier
              ({Object.entries({ NM: 1, LP: 0.85, MP: 0.7, HP: 0.55, DMG: 0.4 }).map(([k, v]) => `${k} ${v * 100}%`).join(" · ")}).
              The green/red chip is your profit/loss where you&apos;ve recorded what you paid.
            </p>
          </section>
        </>
      )}

      {/* Add & edit your collection: quantity, condition, foil and what you paid
          (the "paid" price powers the profit/loss above). Handles its own empty
          state and "add a card" guidance, so it shows for new users too. */}
      <MyCollection />

      {/* Below the collection editor on purpose: sharing is something you do
          once the binder is worth showing, not the first thing you meet. */}
      <CollectionShare />
    </div>
  );
}
