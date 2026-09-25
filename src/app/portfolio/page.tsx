import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPortfolio, isPremium, premiumCheckoutEnabled, premiumTierOf, PORTFOLIO_FREE, type Portfolio } from "@/lib/premium";
import { getPremiumNudge, nudgeCopy } from "@/lib/premium-nudge";
import { PremiumNudgeCard } from "@/components/PremiumNudgeCard";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense";
import { formatMoney } from "@/lib/format";
import { CONDITION_MULTIPLIER } from "@/lib/constants";
import { PriceChart } from "@/components/PriceChart";
import { MyCollection } from "@/components/MyCollection";
import { CollectionShare } from "@/components/CollectionShare";
import { HoldingsGrid } from "@/components/HoldingsGrid";
import { PortfolioReplacementCost } from "@/components/PortfolioReplacementCost";
import { PortfolioQuickAdd } from "@/components/PortfolioQuickAdd";
import { NavIcon } from "@/components/NavIcon";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My binder — track your Riftbound collection",
  robots: { index: false, follow: false }, // personal page, never indexed
};

// ── Why this page stopped talking like a trading desk (2026-09-16) ───────────
// It was "My portfolio", with Profit & Loss, Invested, Return and holdings. That
// is finance vocabulary for a shoebox of cardboard, and a reader told us more
// than once that the site reads as "too greedy/capitalistic/money focused ... for
// a card GAME". Every number on this page is unchanged — what changed is that it
// now says "what you paid" and "worth now" rather than borrowing the language of
// an asset class. "Binder" is what a player calls the place they keep cards, and
// it is already the word this site's own share copy uses ("<name>'s binder", see
// app/c/[token]/opengraph-image.tsx).
//
// The ROUTE stays /portfolio: it is noindex, so nothing SEO rides on it, and
// changing it would break every bookmark for no gain. "portfolio" also stays a
// ⌘K search keyword in nav-groups.ts, so typing the old word still lands here.

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

// The Premium "investor" panel: cost-basis P&L + how the portfolio is tracking
// against the RiftCompare Index over the same windows.
function PnlView({
  pnl,
  index,
  d7,
  d30,
  currency,
}: {
  pnl: NonNullable<Portfolio["pnl"]>;
  index: Portfolio["index"];
  d7: number | null;
  d30: number | null;
  currency: string;
}) {
  const beat = (port: number | null, idx: number | null) => (port != null && idx != null ? Math.round((port - idx) * 10) / 10 : null);
  return (
    <div className="mt-3 space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="You paid" value={formatMoney(pnl.investedCents, currency)} />
        <Stat label="Worth now" value={formatMoney(pnl.valueCents, currency)} />
        <Stat label="Up / down" value={`${pnl.plCents >= 0 ? "+" : "−"}${formatMoney(Math.abs(pnl.plCents), currency)}`} cls={pctClass(pnl.plCents)} />
        <Stat label="Change" value={pctText(pnl.plPct)} cls={pctClass(pnl.plPct)} />
      </div>
      {index && (index.d7 != null || index.d30 != null) && (
        <div className="rounded-lg border border-ink-700 bg-ink-900/60 p-3 text-sm">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">vs the market (RiftCompare Index)</div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { w: "7-day", port: d7, idx: index.d7 },
              { w: "30-day", port: d30, idx: index.d30 },
            ].map(({ w, port, idx }) => {
              const b = beat(port, idx);
              return (
                <div key={w} className="flex flex-col">
                  <span className="text-xs text-slate-500">{w}: you <span className={pctClass(port)}>{pctText(port)}</span> · index <span className={pctClass(idx)}>{pctText(idx)}</span></span>
                  {b != null && (
                    <span className={`text-sm font-bold ${pctClass(b)}`}>
                      {b > 0 ? `▲ Beating the market by ${b}%` : b < 0 ? `▼ Trailing the market by ${Math.abs(b)}%` : "Matching the market"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-600">
        This covers the {pnl.costedRows} card{pnl.costedRows === 1 ? "" : "s"} you&apos;ve recorded a price for. Add a
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
  // reviewer following links from the header lands on it. With the flag off a
  // gated panel simply doesn't render: the blurred Premium previews that used to
  // stand in for it were deleted (2026-09-25) because their copy was false, so
  // re-gating means writing a new, true pitch first.
  const pro = premium || PORTFOLIO_FREE || ADSENSE_REVIEW_MODE;
  // Which of the cards they OWN are Rising Cards picks right now — a Plus
  // upsell for a free account, a link to the picks for a member; accounts with
  // a collection only (lib/premium-nudge.ts). Never fails the page.
  const nudge =
    (premium || premiumCheckoutEnabled()) && portfolio.holdings.length > 0
      ? await getPremiumNudge(user.id, country).catch(() => null)
      : null;
  const ownedNudge = nudge ? nudgeCopy(nudge, "owned", premium ? "member" : "free") : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-white">
            <NavIcon name="collection" className="h-6 w-6 text-brand-400" />
            My binder
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Your cards, and what they&apos;d cost at today&apos;s lowest {info.adjective} prices, adjusted for condition.
          </p>
        </div>
        {premium && (
          <span
            className={`chip text-xs font-bold ${
              premiumTierOf(user) === "plus" ? "bg-slate-500/15 text-slate-200" : "bg-gold/15 text-gold"
            }`}
          >
            ★ {premiumTierOf(user) === "plus" ? "PLUS" : "PREMIUM"}
          </span>
        )}
      </div>

      {/* Headline value — always shown, even before the first card is added,
          so a brand-new free account has a reason to come back. */}
      <section className="card-surface overflow-hidden bg-gradient-to-br from-brand-600/15 via-ink-850 to-gold/10 p-5">
        {portfolio.holdings.length > 0 ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Collection value · {info.code} market
                </div>
                <div className="font-display text-5xl font-extrabold text-white">
                  {formatMoney(portfolio.totalCents, info.currency)}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {portfolio.pricedCount} card{portfolio.pricedCount === 1 ? "" : "s"} with a live price
                  {portfolio.unpricedCount > 0 && <> · {portfolio.unpricedCount} awaiting a live price</>}
                </p>
              </div>
              {/* No "1 day" chip: PriceHistory is written weekly, so the previous
                  snapshot is a week back and that chip was the 7-day move under
                  another label. */}
              <div className="grid grid-cols-2 gap-2">
                <Delta label="7 days" pct={portfolio.d7} />
                <Delta label="30 days" pct={portfolio.d30} />
              </div>
            </div>

            {/* Value-over-time (free via PORTFOLIO_FREE). The blurred "Premium
                feature" gate that used to sit in the else-branch is gone: it could
                only render with PORTFOLIO_FREE off, and it advertised "daily
                history" and "unlimited price alerts" — history is weekly and alerts
                were never paid. Re-gating would need new copy anyway. */}
            {pro && (
              <div className="mt-4">
                {portfolio.series.length >= 2 ? (
                  <>
                    <PriceChart points={portfolio.series} currency={info.currency} />
                    <p className="mt-2 text-[11px] text-slate-500">
                      Your cards at each weekly price snapshot. A card starts counting toward a move once it has
                      a price at both ends of a week, so a newly priced card never shows up as a gain, and a change
                      in how we source prices (TCGplayer&apos;s, on 23 Sep 2026) is held flat, as on the{" "}
                      <Link href="/market" className="text-brand-400 hover:underline">RiftCompare Index</Link>.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    Your value history starts charting after the next weekly snapshot.
                  </p>
                )}
              </div>
            )}

            {pro && (
              <div className="mt-3 text-right">
                <a href="/api/portfolio/export" className="btn-ghost text-xs">⬇ Export CSV</a>
              </div>
            )}
          </>
        ) : (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Collection value · {info.code} market
            </div>
            <div className="font-display text-5xl font-extrabold text-white">{formatMoney(0, info.currency)}</div>
            <p className="mt-1 text-sm text-slate-400">Add your first card to start valuing your collection.</p>
            <div className="mt-4 max-w-sm">
              <PortfolioQuickAdd />
            </div>
          </div>
        )}
      </section>

      {ownedNudge && <PremiumNudgeCard {...ownedNudge} member={premium} surface="nudge:portfolio" />}

      {portfolio.holdings.length > 0 && (
        <>
          {/* What re-buying the collection would actually cost, postage included.
              Sits directly under the headline because it answers the question the
              headline raises: that number prices each card at the cheapest listing
              in the market and says nothing about getting them to your door. */}
          {pro && <PortfolioReplacementCost currency={info.currency} />}

          {/* Cost basis vs. today, and how that tracks the market. Free via
              PORTFOLIO_FREE; the blurred Premium gate that sat in the else-branch
              could never render and is gone (see the chart note above). */}
          {pro && (
            <section className="card-surface p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-lg font-extrabold text-white">
                  <NavIcon name="chart" className="h-5 w-5 text-brand-400" />
                  Since you bought
                </h2>
              </div>
              {portfolio.pnl ? (
                <PnlView pnl={portfolio.pnl} index={portfolio.index} d7={portfolio.d7} d30={portfolio.d30} currency={info.currency} />
              ) : (
                <p className="mt-2 text-sm text-slate-400">
                  Record what you paid for a card (the <strong className="text-slate-200">paid</strong> field in My Collection below) and
                  how it&apos;s done since — plus how that tracks the wider market — appears here.
                </p>
              )}
            </section>
          )}

          {/* Your cards — a visual showcase, dearest first. */}
          <section>
            <div className="mb-3 flex items-end justify-between gap-2">
              <h2 className="text-lg font-extrabold text-white">Your cards</h2>
              <span className="text-xs text-slate-500">{portfolio.holdings.length} {portfolio.holdings.length === 1 ? "entry" : "entries"} · dearest first</span>
            </div>
            <HoldingsGrid holdings={portfolio.holdings} currency={info.currency} />
            <p className="mt-3 text-[11px] text-slate-600">
              Values are the live lowest in-stock store price × the standard condition multiplier
              ({Object.entries(CONDITION_MULTIPLIER).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(" · ")}).
              The green/red chip shows how a card has moved since you paid for it, where you&apos;ve recorded that.
            </p>
          </section>
        </>
      )}

      {/* Add & edit your collection: quantity, condition, foil and what you paid
          (the "paid" price powers the profit/loss above). Handles its own empty
          state and "add a card" guidance, so it shows for new users too. */}
      {/* refreshPage: an edit re-renders this server page (debounced), so the
          headline, the holdings grid and "Since you bought" follow the edit
          instead of waiting for a manual reload. */}
      <MyCollection refreshPage />

      {/* Below the collection editor on purpose: sharing is something you do
          once the binder is worth showing, not the first thing you meet. */}
      <CollectionShare />
    </div>
  );
}
