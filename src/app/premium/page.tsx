import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  isPremium,
  premiumCheckoutEnabled,
  premiumTrialEnabled,
  premiumAnnualEnabled,
  premiumPlusEnabled,
  plusAnnualEnabled,
  premiumTierOf,
  getPremiumSubscriptionDetails,
  PREMIUM_TRIAL_DAYS,
} from "@/lib/premium";
import { PremiumCta } from "@/components/PremiumCta";
import { ManageSubscriptionButton } from "@/components/ManageSubscriptionButton";
import { UpgradeTierButton } from "@/components/UpgradeTierButton";
import { AnnualPriceBlock } from "@/components/AnnualPriceBlock";
import { TrialPriceBlock } from "@/components/TrialPriceBlock";
import { TierComparisonTable } from "@/components/TierComparisonTable";
import {
  SITE_URL,
  PREMIUM_PRICE_AMOUNT,
  PREMIUM_PRICE_PERIOD,
  PREMIUM_ANNUAL_AMOUNT,
  PREMIUM_NEXT_PRICE_AMOUNT,
  TIER_NAMES,
  tierMonthlyAmount,
  tierAnnualAmount,
  premiumPriceIncreaseAnnounced,
  premiumLockInLine,
  premiumFromLine,
  premiumZeroToday,
  type PremiumTierKey,
} from "@/lib/site";
import { pageAlternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getCountry } from "@/lib/get-country";
import { getCachedTopDeals } from "@/lib/top-deals";
import { getUndervalued } from "@/lib/screener";
import { formatMoneyCompact } from "@/lib/format";
import { currencyOf } from "@/lib/country";
import { faqPage, ldJson } from "@/lib/jsonld";
import { PremiumRecoveryBeacon } from "@/components/PremiumRecoveryBeacon";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "RiftCompare Premium — get an unfair edge buying and selling",
  description: "RiftCompare Premium: the Bulk Pricer, Best Basket optimiser, Value Finder screener, Rising Cards, Demand Finder, the full Deal Finder list and an ad-free site. Price comparison is free for everyone, and a free account adds alerts and your portfolio.",
  alternates: pageAlternates("/premium"),
};

// Detailed feature cards (all real Premium features). `tier` names the
// CHEAPEST tier that actually includes it — "plus" for the full-list tools
// (also included in Premium), "premium" for the four pro tools. Shown as a
// small caption only once Plus is actually live (see the render below); with
// Plus dark every card reads as Premium-only, same as before the split.
const FEATURES: { title: string; body: string; href: string | null; cta: string | null; tier: PremiumTierKey }[] = [
  {
    title: "Bulk Pricer",
    body: "Paste an entire want-list, trade pile or collection and price every card at once, each matched to its cheapest live store price with a running total.",
    href: "/bulk-pricer",
    cta: "Open Bulk Pricer",
    tier: "premium",
  },
  {
    title: "Best Basket",
    body: "Paste a decklist or use your wishlist and get the cheapest way to actually buy the whole thing — the store split with the lowest landed cost once postage and free-shipping thresholds are factored in.",
    href: "/tools/best-basket",
    cta: "Open Best Basket",
    tier: "premium",
  },
  {
    title: "Value Finder screener",
    body: "Every card trading below its own 30-day average right now, ranked by discount — spot undervalued cards before they bounce back.",
    href: "/tools/value-finder",
    cta: "Open Value Finder",
    tier: "premium",
  },
  {
    title: "Rising Cards",
    body: "Cards ranked by demand and price-timing signals — high or rising search interest that hasn't re-rated yet. Transparent scoring, backtested. Free shows only the top pick.",
    href: "/tools/rising",
    cta: "Open Rising Cards",
    tier: "plus",
  },
  {
    title: "Rising Sealed",
    body: "Booster boxes, packs and bundles ranked by price-timing and supply signals — sitting near their own recent low, thin in-stock, not already spiking. Free shows only the top pick.",
    href: "/tools/rising-sealed",
    cta: "Open Rising Sealed",
    tier: "plus",
  },
  {
    title: "Demand Finder",
    body: "The cards RiftCompare visitors are actually searching for and opening right now — raw demand by real traffic, windowed to 7 days, 30 days or all time. No price-timing filter, just the unblended number.",
    href: "/tools/demand",
    cta: "Open Demand Finder",
    tier: "premium",
  },
  {
    title: "Deal Finder",
    body: "The full list of cards worth more on eBay than in stores (handy if you're selling), the cards eBay is cheapest to buy, and cards priced meaningfully cheaper in another tracked market — all sources, sortable, updated daily. Free shows only the top pick.",
    href: "/tools/deal-finder",
    cta: "Open Deal Finder",
    tier: "plus",
  },
  {
    title: "Ad-free everywhere",
    body: "No ads on any page while you're Plus or Premium — automatic, nothing to switch on.",
    href: null,
    cta: null,
    tier: "plus",
  },
];

// The tiers, in the order a visitor moves through them (see lib/premium.ts).
// `true`/`false` render a tick/dash; a string renders verbatim.
const INCLUDED = [
  "Bulk Pricer",
  "Best Basket optimiser",
  "Value Finder screener",
  "Rising Cards",
  "Rising Sealed",
  "Demand Finder",
  "Full Deal Finder list",
  "Ad-free on every page",
  "Everything in the free account tier",
];


// "6 Sep 2026" — same convention admin/premium/page.tsx already uses for this
// exact field, so a user's own account page and the admin's view of the same
// account never disagree on how a date reads.
const fmtDate = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

// Objection-handling FAQ — this page had none, despite carrying the checkout
// decision every other tool/blog FAQ on the site defers to. Every answer is
// built from the SAME site.ts/premium.ts constants the rest of this page uses
// (PREMIUM_TRIAL_DAYS, premiumLockInLine, the real price strings) rather than
// a second hand-typed copy of them, so a price or trial-length change can't
// leave this FAQ quietly wrong the way PITCH_TOOLS's own header comment warns
// a duplicated list eventually does. Rendered visibly AND as FAQPage JSON-LD —
// Google only honours the schema when the same Q&A is on the page too.
const FAQ: { q: string; a: string }[] = [
  {
    q: "What's free vs what needs Plus or Premium?",
    a: `Price comparison, the deck builder, trade calculator, box EV and a free account's alerts, watchlist and portfolio are free for everyone. ${premiumPlusEnabled() ? `Plus (${tierMonthlyAmount("plus")}/mo) adds the full Deal Finder, Rising Cards and Rising Sealed lists and an ad-free site; Premium adds the four pro tools on top — Bulk Pricer, Best Basket, Value Finder and Demand Finder.` : "Premium adds the Bulk Pricer, Best Basket optimiser, Value Finder screener, Rising Cards, Rising Sealed, Demand Finder, the full Deal Finder list and an ad-free site."}`,
  },
  {
    q: `How does the ${PREMIUM_TRIAL_DAYS}-day free trial work?`,
    a: `Start the trial and every Premium tool unlocks immediately. A card is required to start, and nothing is charged until the trial ends — ${PREMIUM_TRIAL_DAYS} days later you're billed ${PREMIUM_PRICE_AMOUNT}/${PREMIUM_PRICE_PERIOD} (or the annual rate, if you chose that plan) unless you cancel first.`,
  },
  {
    q: "What happens when the trial ends?",
    a: `If you haven't cancelled, the card on file is charged and your subscription continues automatically at whichever plan you chose — ${premiumFromLine()}. You'll get an email reminder before it converts.`,
  },
  {
    q: "How do I cancel?",
    a: "From this page, use \"Manage subscription\" to open Stripe's billing portal and cancel in a couple of clicks — no email or phone call needed. You keep access until the end of the period you already paid for (or, during a trial, until it ends).",
  },
  {
    q: "Does my price ever go up?",
    a: premiumLockInLine(),
  },
  {
    q: "Monthly or annual — what's the difference?",
    a: `Same tools either way. Monthly is ${PREMIUM_PRICE_AMOUNT}/${PREMIUM_PRICE_PERIOD} with no commitment; annual is ${PREMIUM_ANNUAL_AMOUNT}/yr, billed once a year, which works out cheaper per month. Switch from monthly to annual anytime from your account.`,
  },
  {
    q: "Is Premium worth it?",
    a: "Deal Finder and Value Finder alone routinely surface savings worth more than a month's subscription — see the live numbers above. If you buy or sell more than the occasional single card, the pro tools tend to pay for themselves.",
  },
  ...(premiumPlusEnabled()
    ? [
        {
          q: "Can I upgrade from Plus to Premium later?",
          a: `Yes — one click from this page, any time. You're only charged the prorated difference for the rest of your current billing period; the four pro tools unlock immediately.`,
        },
      ]
    : []),
];

// One tier's pricing cards (monthly + optional annual "best value" card).
// Defined IN THIS FILE, not extracted to its own component module, because
// tests/premium-zero-today.test.ts source-greps page.tsx itself for the
// exact `<TrialPriceBlock plan="monthly"` / `plan="annual"` JSX and the
// `trialAvailable={trialAvailable}` prop wiring — extracting this to a
// separate file would move that literal text out of page.tsx and fail those
// assertions. `show=false` renders nothing (used for the Plus block while
// Plus is unconfigured, so the JSX stays in this file either way).
function TierPricingCards({
  tier,
  show,
  annualLive,
  topMargin,
  checkoutLive,
  signedIn,
  trialEligible,
  trialAvailable,
  trialDays,
}: {
  tier: PremiumTierKey;
  show: boolean;
  annualLive: boolean;
  topMargin: string;
  checkoutLive: boolean;
  signedIn: boolean;
  trialEligible: boolean;
  trialAvailable: boolean;
  trialDays: number;
}) {
  if (!show) return null;
  const monthlyAmount = tierMonthlyAmount(tier);
  const annualAmount = tierAnnualAmount(tier);
  const compactPrice = `${monthlyAmount}/${PREMIUM_PRICE_PERIOD === "month" ? "mo" : PREMIUM_PRICE_PERIOD}`;
  const annualCompact = `${annualAmount}/yr`;
  return (
    <div className={`mx-auto ${topMargin} grid gap-4 ${annualLive ? "max-w-2xl sm:grid-cols-2" : "max-w-md"}`}>
      {/* Monthly */}
      <div className="card-surface flex flex-col overflow-hidden rounded-2xl border border-ink-700">
        <div className="border-b border-ink-800 bg-ink-900 px-6 py-6 text-center">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Monthly</div>
          {trialAvailable ? (
            <TrialPriceBlock plan="monthly" trialDays={trialDays} size="compact" tier={tier} />
          ) : (
            <div className="flex items-baseline justify-center gap-1">
              <span className="num text-4xl font-extrabold text-white">{monthlyAmount}</span>
              <span className="text-sm text-slate-400">/{PREMIUM_PRICE_PERIOD}</span>
            </div>
          )}
        </div>
        <div className="flex flex-1 items-end px-6 py-5">
          <PremiumCta
            checkoutLive={checkoutLive}
            signedIn={signedIn}
            trialEligible={trialEligible}
            trialAvailable={trialAvailable}
            priceLabel={compactPrice}
            trialDays={trialDays}
            plan="monthly"
            tier={tier}
          />
        </div>
      </div>

      {/* Annual — best value */}
      {annualLive && (
        <div className="card-surface relative flex flex-col overflow-hidden rounded-2xl border-2 border-gold/60">
          <span className="absolute right-0 top-0 rounded-bl-lg bg-gold px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-ink-950">Best value</span>
          <div className="border-b border-ink-800 bg-ink-900 px-6 py-6 text-center">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gold">Annual</div>
            {trialAvailable ? <TrialPriceBlock plan="annual" trialDays={trialDays} size="compact" tier={tier} /> : <AnnualPriceBlock tier={tier} />}
          </div>
          <div className="flex flex-1 items-end px-6 py-5">
            <PremiumCta
              checkoutLive={checkoutLive}
              signedIn={signedIn}
              trialEligible={trialEligible}
              trialAvailable={trialAvailable}
              trialDays={trialDays}
              priceLabel={annualCompact}
              plan="annual"
              tier={tier}
              ctaLabel={trialEligible ? undefined : `Get annual — ${annualAmount}/yr`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default async function PremiumPage() {
  const user = await getCurrentUser();
  const already = isPremium(user);
  const checkoutLive = premiumCheckoutEnabled();
  const dbUser = user
    ? await prisma.user.findUnique({ where: { id: user.id }, select: { trialStartedAt: true, stripeCustomerId: true } })
    : null;
  const trialEligible = premiumTrialEnabled() && !!user && !already && !dbUser?.trialStartedAt;
  // A brand-new account has, by definition, never started a trial before — so
  // unlike trialEligible (which requires a signed-in user to check their own
  // trialStartedAt), a signed-out visitor is trial-available on the strength
  // of premiumTrialEnabled() alone (same reasoning SignupPromoPopup.tsx's own
  // trialAvailable documents). Used to decide the pricing-card headline and
  // the signed-out CTA copy; trialEligible still gates the actual checkout
  // flow once someone is signed in.
  const trialAvailable = premiumTrialEnabled() && !already && (!user || !dbUser?.trialStartedAt);
  const priceNumeric = PREMIUM_PRICE_AMOUNT.replace(/[^0-9.]/g, "") || "9.99";
  const compactPrice = `${PREMIUM_PRICE_AMOUNT}/${PREMIUM_PRICE_PERIOD === "month" ? "mo" : PREMIUM_PRICE_PERIOD}`;
  const annualLive = premiumAnnualEnabled();
  const annualCompact = `${PREMIUM_ANNUAL_AMOUNT}/yr`;
  const plusLive = premiumPlusEnabled();
  const plusAnnualLive = plusAnnualEnabled();
  const plusPriceNumeric = tierMonthlyAmount("plus").replace(/[^0-9.]/g, "") || "4.99";
  // Real Stripe read, only for someone who's actually Premium right now — see
  // the function's own header for why this is a SEPARATE query from the
  // annual-switch nudge's (that one deliberately excludes trialing subs; this
  // one is a Premium user's own account and must show a trial truthfully too).
  const subDetails = already && dbUser?.stripeCustomerId ? await getPremiumSubscriptionDetails(dbUser.stripeCustomerId) : null;
  const currentTier = premiumTierOf(user);

  // Live value-proof numbers for the strip below the pricing cards — the SAME
  // 1h-cached feed the homepage already reads (getCachedTopDeals) plus the
  // Value Finder screener's own 48h-cached scan, so this page costs nothing
  // extra beyond what's already warm. allSettled: either source failing must
  // never take the whole page down over a nice-to-have proof strip.
  const country = getCountry();
  const [dealsResult, undervaluedResult] = await Promise.allSettled([
    getCachedTopDeals(country),
    getUndervalued(country, 100),
  ]);
  const dealsData = dealsResult.status === "fulfilled" ? dealsResult.value : null;
  const undervaluedCount = undervaluedResult.status === "fulfilled" ? undervaluedResult.value.length : 0;
  const proofTiles = [
    dealsData && dealsData.savingsVsMarketTotal > 0
      ? { value: String(dealsData.savingsVsMarketTotal), label: "eBay deals live right now" }
      : null,
    dealsData && (dealsData.savingsVsMarketCents ?? 0) > 0
      ? { value: formatMoneyCompact(dealsData.savingsVsMarketCents ?? 0, currencyOf(country)), label: "in savings on the board" }
      : null,
    undervaluedCount > 0 ? { value: String(undervaluedCount), label: "cards below their 30-day average" } : null,
  ].filter((t): t is { value: string; label: string } => t !== null);

  return (
    <div className="mx-auto max-w-4xl">
      <PremiumRecoveryBeacon />
      <Breadcrumbs trail={[{ name: "Premium", href: "/premium" }]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson(
            {
              "@context": "https://schema.org",
              "@type": "Product",
              name: "RiftCompare Premium",
              description: "The Bulk Pricer, Best Basket optimiser, Value Finder screener, Rising Cards, Demand Finder, the full Deal Finder list and an ad-free RiftCompare.",
              brand: { "@type": "Organization", name: "RiftCompare", url: SITE_URL },
              // One Offer per live tier — an array with Premium alone reads the
              // same as the old single Offer object once Plus is unconfigured.
              offers: plusLive
                ? [
                    {
                      "@type": "Offer",
                      name: "RiftCompare Plus",
                      price: plusPriceNumeric,
                      priceCurrency: "USD",
                      url: `${SITE_URL}/premium`,
                      availability: "https://schema.org/InStock",
                    },
                    {
                      "@type": "Offer",
                      name: "RiftCompare Premium",
                      price: priceNumeric,
                      priceCurrency: "USD",
                      url: `${SITE_URL}/premium`,
                      availability: "https://schema.org/InStock",
                    },
                  ]
                : {
                    "@type": "Offer",
                    price: priceNumeric,
                    priceCurrency: "USD",
                    url: `${SITE_URL}/premium`,
                    availability: "https://schema.org/InStock",
                  },
            },
            faqPage(FAQ)
          ),
        }}
      />

      {/* Header */}
      <div className="text-center">
        <span className="chip mb-3 inline-flex bg-gold/15 font-bold uppercase tracking-wide text-gold">Premium</span>
        <h1 className="font-display text-3xl font-extrabold text-white sm:text-4xl">
          {already ? `You're ${TIER_NAMES[currentTier ?? "premium"]}` : "Get an unfair edge buying and selling"}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
          {already
            ? "Everything you've unlocked is below — jump straight into any of it. Thanks for supporting RiftCompare."
            : premiumTrialEnabled()
            ? `Try every Premium tool free for ${PREMIUM_TRIAL_DAYS} days — ${premiumZeroToday()}, then ${premiumFromLine()}. Cancel anytime.`
            : `Price comparison is free for everyone, and a free account adds alerts and your portfolio. Premium adds the Bulk Pricer, Best Basket, the pro screeners and an ad-free site — ${premiumFromLine()}, cancel anytime.`}
        </p>
      </div>

      {/* Pricing (upgrade view) — monthly + optional annual best-value plan */}
      {!already && (
        <>
          {premiumPriceIncreaseAnnounced() && (
            <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-gold/40 bg-gold/10 px-5 py-3 text-center">
              <p className="text-sm font-bold text-gold">
                ⏳ Price increasing soon — lock in {PREMIUM_PRICE_AMOUNT}/{PREMIUM_PRICE_PERIOD} now
              </p>
              <p className="mt-1 text-xs text-gold/80">
                New subscribers will pay {PREMIUM_NEXT_PRICE_AMOUNT}/{PREMIUM_PRICE_PERIOD} once the change takes
                effect. Subscribe today and keep {PREMIUM_PRICE_AMOUNT}/{PREMIUM_PRICE_PERIOD} for as long as your
                subscription stays active — no action needed later.
              </p>
            </div>
          )}
          {plusLive && (
            <p className="mb-2 mt-6 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">Plus</p>
          )}
          <TierPricingCards
            tier="plus"
            show={plusLive}
            annualLive={plusAnnualLive}
            topMargin={premiumPriceIncreaseAnnounced() ? "mt-2" : "mt-2"}
            checkoutLive={checkoutLive}
            signedIn={!!user}
            trialEligible={trialEligible}
            trialAvailable={trialAvailable}
            trialDays={PREMIUM_TRIAL_DAYS}
          />
          {plusLive && (
            <p className="mb-2 mt-8 text-center text-[11px] font-bold uppercase tracking-widest text-gold">
              Premium — everything included
            </p>
          )}
          <TierPricingCards
            tier="premium"
            show
            annualLive={annualLive}
            topMargin={plusLive ? "mt-2" : premiumPriceIncreaseAnnounced() ? "mt-4" : "mt-6"}
            checkoutLive={checkoutLive}
            signedIn={!!user}
            trialEligible={trialEligible}
            trialAvailable={trialAvailable}
            trialDays={PREMIUM_TRIAL_DAYS}
          />

          {/* Live proof strip — real numbers pulled from the same tools Premium
              sells, not a marketing claim about them. Each tile hides itself
              if its own number is zero, and the whole strip hides if every
              tile does — a proof strip with nothing to prove is worse than no
              strip at all. */}
          {proofTiles.length > 0 && (
            <div className="mx-auto mt-6 max-w-2xl">
              <div className={`grid gap-3 ${proofTiles.length === 1 ? "max-w-xs mx-auto" : proofTiles.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
                {proofTiles.map((t) => (
                  <div key={t.label} className="card-surface rounded-xl border border-ink-700 px-4 py-3 text-center">
                    <div className="num text-2xl font-extrabold text-brand-300">{t.value}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">{t.label}</div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-center text-[11px] text-slate-500">One saved order covers a month of Premium.</p>
            </div>
          )}

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
            <p className="mt-1 text-center text-[11px] font-medium text-gold/80">{premiumLockInLine()}</p>
          </div>
        </>
      )}

      {/* Your subscription — real account detail, not just "you're Premium".
          Three honest states, never blurred into one another:
            • admin access (bypasses billing entirely, isPremium()'s own rule)
            • a real Stripe subscription (trial or paid, monthly or annual,
              renewing or already set to lapse) — the live read above
            • a comp grant with no Stripe subscription behind it at all
              (feedback/referral reward) — states the date and nothing else,
              since there is no plan/renewal to describe. */}
      {already && user && (
        <div className="mx-auto mt-6 max-w-md rounded-xl border border-ink-700 bg-ink-900 px-5 py-4 text-center">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Your subscription</div>
          {user.isAdmin ? (
            <p className="mt-2 text-sm text-slate-300">Admin access — every Premium feature, no subscription required.</p>
          ) : subDetails ? (
            <div className="mt-2 space-y-1 text-sm text-slate-300">
              <p className="font-semibold text-white">
                {TIER_NAMES[subDetails.tier]} ·{" "}
                {subDetails.status === "trialing"
                  ? "Free trial"
                  : subDetails.interval === "year"
                  ? "Annual plan"
                  : "Monthly plan"}
              </p>
              <p>
                {subDetails.status === "trialing" ? (
                  <>
                    Converts to {subDetails.interval === "year" ? annualCompact : compactPrice} on{" "}
                    {fmtDate(subDetails.currentPeriodEnd)}
                  </>
                ) : subDetails.cancelAtPeriodEnd ? (
                  <>Access ends {fmtDate(subDetails.currentPeriodEnd)} — won&apos;t renew</>
                ) : (
                  <>Renews {fmtDate(subDetails.currentPeriodEnd)}</>
                )}
              </p>
              {subDetails.tier === "plus" && plusLive && (
                <div className="mt-3">
                  <UpgradeTierButton />
                </div>
              )}
            </div>
          ) : user.premiumUntil ? (
            <p className="mt-2 text-sm text-slate-300">Premium until {fmtDate(user.premiumUntil)}</p>
          ) : null}
        </div>
      )}

      {/* Member quick links */}
      {already && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
          <Link href="/dashboard" className="btn-primary">◆ Your dashboard</Link>
          <Link href="/bulk-pricer" className="btn-ghost">Bulk Pricer</Link>
          <Link href="/tools/best-basket" className="btn-ghost">Best Basket</Link>
          <Link href="/tools/value-finder" className="btn-ghost">Value Finder</Link>
          <Link href="/tools/rising" className="btn-ghost">Rising Cards</Link>
          <Link href="/tools/rising-sealed" className="btn-ghost">Rising Sealed</Link>
          <Link href="/tools/demand" className="btn-ghost">Demand Finder</Link>
          <Link href="/tools/deal-finder" className="btn-ghost">Deal Finder</Link>
          <Link href="/tools/condition-calculator" className="btn-ghost">Condition Calculator</Link>
          <Link href="/portfolio" className="btn-ghost">Portfolio</Link>
          {checkoutLive && <ManageSubscriptionButton />}
        </div>
      )}

      {/* Tier comparison */}
      <div className="mt-10">
        <h2 className="mb-1 text-center text-lg font-extrabold text-white">What you get at each tier</h2>
        <p className="mb-3 text-center text-xs text-slate-500">
          {plusLive
            ? "A free account unlocks alerts, your portfolio and price history — Plus adds the full lists and no ads, Premium adds the pro screeners on top."
            : "A free account unlocks alerts, your portfolio and price history — Premium adds the list-pricing tools and the pro screeners."}
        </p>
        <div className="card-surface p-1">
          <TierComparisonTable showPlus={plusLive} />
        </div>
        {!user && (
          <p className="mt-3 text-center text-xs text-slate-400">
            <Link href="/login?next=/premium" className="text-brand-400 hover:underline">
              Create a free account
            </Link>{" "}
            to unlock the middle column — no card required
            .
          </p>
        )}
      </div>

      {/* FAQ — objection handling this page had none of, despite carrying the
          checkout decision. Rendered visibly (not just as JSON-LD above) so
          Google honours the FAQPage markup and so it actually answers a
          reader's question rather than only feeding a rich result. */}
      <div className="mt-10">
        <h2 className="mb-3 text-center text-lg font-extrabold text-white">Frequently asked questions</h2>
        <div className="mx-auto max-w-2xl space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="card-surface rounded-xl border border-ink-700 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-white">{f.q}</summary>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
      </div>

      {/* Feature detail cards */}
      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className={`card-surface flex flex-col border-l-2 p-4 ${f.tier === "plus" && plusLive ? "border-slate-400/40" : "border-gold/40"}`}>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white">{f.title}</h3>
              {plusLive && (
                <span className={`chip text-[9px] font-semibold ${f.tier === "plus" ? "bg-slate-500/15 text-slate-300" : "bg-gold/15 text-gold"}`}>
                  {f.tier === "plus" ? "Plus & Premium" : "Premium"}
                </span>
              )}
            </div>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{f.body}</p>
            {already && f.href && <Link href={f.href} className="btn-ghost mt-3 self-start text-sm">{f.cta} →</Link>}
          </div>
        ))}
      </div>

      {/* Footer note */}
      <p className="mx-auto mt-8 max-w-xl text-center text-xs leading-relaxed text-slate-500">
        Premium pays for the servers and price data, which is what keeps price comparison free for everyone and
        alerts and your portfolio free with an account.{" "}
        {already ? (
          <>Update your card or cancel anytime via &ldquo;Manage subscription&rdquo; above. </>
        ) : trialAvailable ? (
          <>
            The free trial needs a card and converts to the plan you picked
            {plusLive ? <> — {tierMonthlyAmount("plus")}/{PREMIUM_PRICE_PERIOD} for Plus, {PREMIUM_PRICE_AMOUNT}/{PREMIUM_PRICE_PERIOD} for Premium</> : <> ({PREMIUM_PRICE_AMOUNT}/{PREMIUM_PRICE_PERIOD})</>}
            {" "}after {PREMIUM_TRIAL_DAYS} day{PREMIUM_TRIAL_DAYS === 1 ? "" : "s"} unless you cancel first.{" "}
          </>
        ) : (
          <>Cancel anytime — your benefits run to the end of the paid period. </>
        )}
        <Link href="/contact" className="text-slate-400 hover:underline">Questions? Get in touch</Link>.
      </p>
    </div>
  );
}
