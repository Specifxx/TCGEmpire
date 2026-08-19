import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isPremium, premiumCheckoutEnabled, premiumTrialEnabled, premiumAnnualEnabled, PREMIUM_TRIAL_DAYS } from "@/lib/premium";
import { PremiumCta } from "@/components/PremiumCta";
import { ManageSubscriptionButton } from "@/components/ManageSubscriptionButton";
import { AnnualPriceBlock } from "@/components/AnnualPriceBlock";
import { SITE_URL, PREMIUM_PRICE_AMOUNT, PREMIUM_PRICE_PERIOD, PREMIUM_ANNUAL_AMOUNT } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "RiftCompare Premium — power tools for buyers & sellers",
  description: "RiftCompare Premium: the Value Finder screener, Rising Cards, the full Deal Finder list and an ad-free site. Price comparison is free for everyone, and a free account adds the Bulk Pricer and Best Basket.",
  alternates: pageAlternates("/premium"),
};

// Detailed feature cards (all real Premium features).
const FEATURES: { title: string; body: string; href: string | null; cta: string | null }[] = [
  {
    title: "Value Finder screener",
    body: "Every card trading below its own 30-day average right now, ranked by discount — spot undervalued cards before they bounce back.",
    href: "/tools/value-finder",
    cta: "Open Value Finder",
  },
  {
    title: "Rising Cards",
    body: "Cards ranked by demand and price-timing signals — high or rising search interest that hasn't re-rated yet. Transparent scoring, backtested. Free shows only the top pick.",
    href: "/tools/rising",
    cta: "Open Rising Cards",
  },
  {
    title: "Deal Finder",
    body: "The full list of cards worth more on eBay than in stores (handy if you're selling) and the cards eBay is cheapest to buy — all sources, sortable, updated daily. Free shows only the top pick.",
    href: "/tools/deal-finder",
    cta: "Open Deal Finder",
  },
  {
    title: "Ad-free everywhere",
    body: "No ads on any page while you're Premium — automatic, nothing to switch on.",
    href: null,
    cta: null,
  },
];

// The three tiers, in the order a visitor moves through them (see lib/premium.ts).
// `true`/`false` render a tick/dash; a string renders verbatim.
const COMPARE: { feature: string; anon: boolean | string; account: boolean | string; premium: boolean | string }[] = [
  { feature: "Compare prices across every store + eBay", anon: true, account: true, premium: true },
  { feature: "Full card database, search & browse", anon: true, account: true, premium: true },
  { feature: "Deck builder, trade calculator & box EV", anon: true, account: true, premium: true },
  { feature: "RiftCompare Index, movers & daily wrap", anon: true, account: true, premium: true },
  { feature: "Bulk Pricer — price a whole list at once", anon: false, account: true, premium: true },
  { feature: "Best-Basket cart optimiser", anon: false, account: true, premium: true },
  { feature: "Price alerts", anon: false, account: true, premium: true },
  { feature: "Portfolio tracker — history, P&L, CSV export", anon: false, account: true, premium: true },
  { feature: "Deal Finder", anon: "Top pick", account: "Top pick", premium: "Full list" },
  { feature: "Rising Cards", anon: "Top pick", account: "Top pick", premium: "Full list" },
  { feature: "Value Finder screener", anon: false, account: false, premium: true },
  { feature: "Ad-free experience", anon: false, account: false, premium: true },
];

const INCLUDED = [
  "Value Finder screener",
  "Rising Cards",
  "Full Deal Finder list",
  "Ad-free on every page",
  "Everything in the free account tier",
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
  const annualCompact = `${PREMIUM_ANNUAL_AMOUNT}/yr`;

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumbs trail={[{ name: "Premium", href: "/premium" }]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: "RiftCompare Premium",
            description: "The Value Finder screener, Rising Cards, the full Deal Finder list and an ad-free RiftCompare.",
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
          {already ? "You're Premium" : "Power tools for buyers & sellers"}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
          {already
            ? "Everything you've unlocked is below — jump straight into any of it. Thanks for supporting RiftCompare."
            : "Price comparison is free for everyone, and a free account adds the Bulk Pricer, Best Basket, alerts and your portfolio. Premium adds the pro screeners and an ad-free site — cancel anytime."}
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
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gold">Annual</div>
                  <AnnualPriceBlock />
                  {trialEligible && <p className="mt-2 text-xs font-semibold text-gold">Starts with a {PREMIUM_TRIAL_DAYS}-day free trial</p>}
                </div>
                <div className="flex flex-1 items-end px-6 py-5">
                  <PremiumCta
                    checkoutLive={checkoutLive}
                    signedIn={!!user}
                    trialEligible={trialEligible}
                    trialDays={PREMIUM_TRIAL_DAYS}
                    priceLabel={annualCompact}
                    plan="annual"
                    ctaLabel={trialEligible ? undefined : `Get annual — ${PREMIUM_ANNUAL_AMOUNT}/yr`}
                  />
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
          <Link href="/tools/rising" className="btn-ghost">Rising Cards</Link>
          <Link href="/tools/deal-finder" className="btn-ghost">Deal Finder</Link>
          <Link href="/portfolio" className="btn-ghost">Portfolio</Link>
          {checkoutLive && <ManageSubscriptionButton />}
        </div>
      )}

      {/* Tier comparison */}
      <div className="mt-10">
        <h2 className="mb-1 text-center text-lg font-extrabold text-white">What you get at each tier</h2>
        <p className="mb-3 text-center text-xs text-slate-500">
          A free account is the biggest single step — it unlocks the two list-pricing tools.
        </p>
        <div className="card-surface overflow-x-auto p-1">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-left">
                <th className="px-3 py-2.5 font-semibold text-slate-400">Feature</th>
                <th className="w-24 px-3 py-2.5 text-center font-semibold text-slate-400">
                  No account
                </th>
                <th className="w-24 px-3 py-2.5 text-center font-bold text-brand-300">
                  Free account
                </th>
                <th className="w-24 px-3 py-2.5 text-center font-bold text-gold">Premium</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((r) => (
                <tr key={r.feature} className="border-b border-ink-800 last:border-0">
                  <td className="px-3 py-2.5 text-slate-200">{r.feature}</td>
                  <td className="px-3 py-2.5 text-center"><Cell v={r.anon} /></td>
                  <td className="px-3 py-2.5 text-center"><Cell v={r.account} /></td>
                  <td className="px-3 py-2.5 text-center"><Cell v={r.premium} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!user && (
          <p className="mt-3 text-center text-xs text-slate-400">
            <Link href="/login?next=/premium" className="text-brand-400 hover:underline">
              Create a free account
            </Link>{" "}
            to unlock the middle column — no card required.
          </p>
        )}
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
        Premium pays for the servers and price data, which is what keeps price comparison free for everyone and the
        list tools, alerts and portfolio free with an account.{" "}
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
