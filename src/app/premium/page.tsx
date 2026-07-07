import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isPremium, premiumCheckoutEnabled, premiumTrialEnabled, premiumAnnualEnabled, PREMIUM_TRIAL_DAYS } from "@/lib/premium";
import { PremiumCta } from "@/components/PremiumCta";
import { ManageSubscriptionButton } from "@/components/ManageSubscriptionButton";
import { SITE_URL, PREMIUM_PRICE_AMOUNT, PREMIUM_PRICE_PERIOD, PREMIUM_ANNUAL_AMOUNT, PREMIUM_ANNUAL_PERIOD, annualSavingPct } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "RiftCompare Premium — power tools for buyers & flippers",
  description:
    "RiftCompare Premium: the Best-Basket cart optimiser, the Value Finder screener, the full arbitrage/flipping list and an ad-free site. Price comparison and the portfolio tracker stay free.",
  alternates: { canonical: "/premium" },
};

// Detailed feature cards (all four real Premium features).
const FEATURES: { title: string; body: string; href: string | null; cta: string | null }[] = [
  {
    title: "Best-Basket cart optimiser",
    body: "The cheapest way to buy a whole deck or wishlist — the smartest split across stores once postage and free-shipping thresholds are in, with direct buy links.",
    href: "/tools/best-basket",
    cta: "Open Best Basket",
  },
  {
    title: "Value Finder screener",
    body: "Every card trading below its own 30-day average right now, ranked by discount — spot undervalued cards before they bounce back.",
    href: "/tools/value-finder",
    cta: "Open Value Finder",
  },
  {
    title: "Arbitrage & flipping finder",
    body: "The full list of profitable flips (buy from a store, sell on eBay) and the cards eBay is cheapest to buy — all sources, sortable, paginated, updated daily. Free shows only the top pick.",
    href: "/tools/arbitrage",
    cta: "Open Arbitrage",
  },
  {
    title: "Ad-free everywhere",
    body: "No ads on any page while you're Premium — automatic, nothing to switch on.",
    href: null,
    cta: null,
  },
];

// Free vs Premium. `true`/`false` render a tick/dash; a string renders verbatim.
const COMPARE: { feature: string; free: boolean | string; premium: boolean | string }[] = [
  { feature: "Compare prices across every store + eBay", free: true, premium: true },
  { feature: "Full card database, search & browse", free: true, premium: true },
  { feature: "Portfolio tracker — history, P&L, CSV export", free: true, premium: true },
  { feature: "Price alerts", free: true, premium: true },
  { feature: "RiftCompare Index, movers & daily wrap", free: true, premium: true },
  { feature: "Arbitrage / flipping finder", free: "Top pick", premium: "Full list" },
  { feature: "Best-Basket cart optimiser", free: false, premium: true },
  { feature: "Value Finder screener", free: false, premium: true },
  { feature: "Ad-free experience", free: false, premium: true },
];

const INCLUDED = [
  "Best-Basket cart optimiser",
  "Value Finder screener",
  "Full arbitrage & flipping list",
  "Ad-free on every page",
];

function Cell({ v }: { v: boolean | string }) {
  if (v === true) return <span className="font-bold text-brand-400" aria-label="Included">✓</span>;
  if (v === false) return <span className="text-slate-600" aria-label="Not included">—</span>;
  return <span className="text-xs font-semibold text-slate-300">{v}</span>;
}

export default async function PremiumPage() {
  const user = await getCurrentUser();
  const already = isPremium(user);
  const checkoutLive = premiumCheckoutEnabled();
  const dbUser = user ? await prisma.user.findUnique({ where: { id: user.id }, select: { trialStartedAt: true } }) : null;
  const trialEligible = premiumTrialEnabled() && !!user && !already && !dbUser?.trialStartedAt;
  const priceNumeric = PREMIUM_PRICE_AMOUNT.replace(/[^0-9.]/g, "") || "4.99";
  const compactPrice = `${PREMIUM_PRICE_AMOUNT}/${PREMIUM_PRICE_PERIOD === "month" ? "mo" : PREMIUM_PRICE_PERIOD}`;
  const annualLive = premiumAnnualEnabled();
  const savePct = annualSavingPct();
  const annualNum = Number(PREMIUM_ANNUAL_AMOUNT.replace(/[^0-9.]/g, "")) || 0;
  const annualPerMonth = annualNum ? `$${(annualNum / 12).toFixed(2)}` : "";

  return (
    <div className="mx-auto max-w-4xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: "RiftCompare Premium",
            description: "The Best-Basket cart optimiser, the Value Finder screener, the full arbitrage list and an ad-free RiftCompare.",
            brand: { "@type": "Organization", name: "RiftCompare", url: SITE_URL },
            offers: {
              "@type": "Offer",
              price: priceNumeric,
              priceCurrency: "USD",
              url: `${SITE_URL}/premium`,
              availability: "https://schema.org/InStock",
            },
          }),
        }}
      />

      {/* Header */}
      <div className="text-center">
        <span className="chip mb-3 inline-flex bg-gold/15 font-bold uppercase tracking-wide text-gold">Premium</span>
        <h1 className="font-display text-3xl font-extrabold text-white sm:text-4xl">
          {already ? "You're Premium" : "Power tools for buyers & flippers"}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
          {already
            ? "Everything you've unlocked is below — jump straight into any of it. Thanks for supporting RiftCompare."
            : "Price comparison and the portfolio tracker stay free. Premium adds the pro tools and an ad-free site — cancel anytime."}
        </p>
      </div>

      {/* Pricing (upgrade view) — monthly + optional annual best-value plan */}
      {!already && (
        <>
          <div className={`mx-auto mt-6 grid gap-4 ${annualLive ? "max-w-2xl sm:grid-cols-2" : "max-w-md"}`}>
            {/* Monthly */}
            <div className="card-surface flex flex-col overflow-hidden rounded-2xl border border-ink-700">
              <div className="border-b border-ink-800 bg-ink-900 px-6 py-6 text-center">
                <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Monthly</div>
                <div className="mt-2 flex items-baseline justify-center gap-1">
                  <span className="num text-4xl font-extrabold text-white">{PREMIUM_PRICE_AMOUNT}</span>
                  <span className="text-sm text-slate-400">/{PREMIUM_PRICE_PERIOD}</span>
                </div>
                {trialEligible && <p className="mt-1 text-xs font-semibold text-gold">Starts with a {PREMIUM_TRIAL_DAYS}-day free trial</p>}
              </div>
              <div className="flex flex-1 items-end px-6 py-5">
                <PremiumCta checkoutLive={checkoutLive} signedIn={!!user} trialEligible={trialEligible} priceLabel={compactPrice} trialDays={PREMIUM_TRIAL_DAYS} plan="monthly" />
              </div>
            </div>

            {/* Annual — best value */}
            {annualLive && (
              <div className="card-surface relative flex flex-col overflow-hidden rounded-2xl border-2 border-gold/60">
                <span className="absolute right-0 top-0 rounded-bl-lg bg-gold px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-ink-950">Best value</span>
                <div className="border-b border-ink-800 bg-ink-900 px-6 py-6 text-center">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-gold">Annual</div>
                  <div className="mt-2 flex items-baseline justify-center gap-1">
                    <span className="num text-4xl font-extrabold text-white">{PREMIUM_ANNUAL_AMOUNT}</span>
                    <span className="text-sm text-slate-400">/{PREMIUM_ANNUAL_PERIOD}</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-gold">
                    {annualPerMonth && `${annualPerMonth}/mo`}{savePct > 0 && `${annualPerMonth ? " · " : ""}save ${savePct}%`}
                  </p>
                </div>
                <div className="flex flex-1 items-end px-6 py-5">
                  <PremiumCta checkoutLive={checkoutLive} signedIn={!!user} plan="annual" ctaLabel={`Get annual — ${PREMIUM_ANNUAL_AMOUNT}/yr`} />
                </div>
              </div>
            )}
          </div>

          {/* Shared included list + notes */}
          <div className="mx-auto mt-5 max-w-2xl">
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {INCLUDED.map((x) => (
                <li key={x} className="flex items-center gap-2 text-slate-300">
                  <span className="font-bold text-brand-400">✓</span> {x}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-center text-[11px] text-slate-500">Cancel anytime · secure checkout by Stripe</p>
            <p className="mt-1 text-center text-[11px] font-medium text-gold/80">
              Subscribe now and your price is locked in for good — it never goes up while you stay subscribed, even as we add more tools.
            </p>
          </div>
        </>
      )}

      {/* Member quick links */}
      {already && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
          <Link href="/dashboard" className="btn-primary">◆ Your dashboard</Link>
          <Link href="/tools/best-basket" className="btn-ghost">Best Basket</Link>
          <Link href="/tools/value-finder" className="btn-ghost">Value Finder</Link>
          <Link href="/tools/arbitrage" className="btn-ghost">Arbitrage</Link>
          <Link href="/portfolio" className="btn-ghost">Portfolio</Link>
          {checkoutLive && <ManageSubscriptionButton />}
        </div>
      )}

      {/* Free vs Premium comparison */}
      <div className="mt-10">
        <h2 className="mb-3 text-center text-lg font-extrabold text-white">Free vs Premium</h2>
        <div className="card-surface overflow-x-auto p-1">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-left">
                <th className="px-3 py-2.5 font-semibold text-slate-400">Feature</th>
                <th className="w-24 px-3 py-2.5 text-center font-semibold text-slate-400">Free</th>
                <th className="w-24 px-3 py-2.5 text-center font-bold text-gold">Premium</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((r) => (
                <tr key={r.feature} className="border-b border-ink-800 last:border-0">
                  <td className="px-3 py-2.5 text-slate-200">{r.feature}</td>
                  <td className="px-3 py-2.5 text-center"><Cell v={r.free} /></td>
                  <td className="px-3 py-2.5 text-center"><Cell v={r.premium} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Feature detail cards */}
      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="card-surface flex flex-col border-l-2 border-gold/40 p-4">
            <h3 className="font-bold text-white">{f.title}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{f.body}</p>
            {already && f.href && <Link href={f.href} className="btn-ghost mt-3 self-start text-sm">{f.cta} →</Link>}
          </div>
        ))}
      </div>

      {/* Footer note */}
      <p className="mx-auto mt-8 max-w-xl text-center text-xs leading-relaxed text-slate-500">
        Premium pays for the servers and price data and keeps the core — price comparison and the portfolio tracker —
        free for everyone.{" "}
        {already ? (
          <>Update your card or cancel anytime via &ldquo;Manage subscription&rdquo; above. </>
        ) : trialEligible ? (
          <>The free trial needs a card and converts to {PREMIUM_PRICE_AMOUNT}/{PREMIUM_PRICE_PERIOD} after {PREMIUM_TRIAL_DAYS} day{PREMIUM_TRIAL_DAYS === 1 ? "" : "s"} unless you cancel first. </>
        ) : (
          <>Cancel anytime — your benefits run to the end of the paid period. </>
        )}
        <Link href="/contact" className="text-slate-400 hover:underline">Questions? Get in touch</Link>.
      </p>
    </div>
  );
}
