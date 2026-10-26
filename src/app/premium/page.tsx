import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  isPremium,
  premiumCheckoutEnabled,
  premiumTrialEnabled,
  trialOfferedTo,
  premiumAnnualEnabled,
  premiumPlusEnabled,
  plusConfigured,
  plusAnnualEnabled,
  premiumTierOf,
  getPremiumSubscriptionDetails,
  subscriptionChargeLine,
  hasEverPaid,
  introEligibleFor,
  PREMIUM_TRIAL_DAYS,
  PREMIUM_TRIAL_FEE_CENTS,
} from "@/lib/premium";
import { getCountry } from "@/lib/get-country";
import { premiumHeroLine, PREMIUM_HERO_HEADLINE, PREMIUM_HERO_SUBLINE } from "@/lib/premium-plan-copy";
import { CtaZone, PremiumPageView } from "@/components/premium/PremiumPageClient";
import { FREE_PLANS_PER_MONTH } from "@/lib/basket-meter";
import { PremiumPricingCards } from "@/components/PremiumPricingCards";
import { PremiumPlanTable } from "@/components/premium/PremiumPlanTable";
import { ManageSubscriptionButton } from "@/components/ManageSubscriptionButton";
import { SubscriptionActions } from "@/components/SubscriptionActions";
import { PremiumTicks } from "@/components/PremiumTicks";
import { cookies } from "next/headers";
import { CreatorCodeBox } from "@/components/CreatorCodeBox";
import { findActiveAffiliate } from "@/lib/creator-affiliate";
import { AFFILIATE_COOKIE, normaliseAffiliateCode } from "@/lib/creator-affiliate-code";
import {
  SITE_URL,
  PLUS_ON_SALE,
  PREMIUM_PRICE_AMOUNT,
  PREMIUM_PRICE_PERIOD,
  PREMIUM_ANNUAL_AMOUNT,
  PREMIUM_NEXT_PRICE_AMOUNT,
  TIER_NAMES,
  tierMonthlyAmount,
  premiumPriceIncreaseAnnounced,
  premiumLockInLine,
  premiumLockInHeadline,
  premiumTrialFee,
  premiumEffectiveMonthly,
  introOfferEnabled,
  introAmountOffCents,
} from "@/lib/site";
import {
  DECK_WATCH_LIMIT,
  PLUS_TARGET_ALERT_LIMIT,
  SEALED_CHECK_CADENCE,
  SEALED_RRP_MARKETS,
  SEALED_WATCH_LIMIT_PLUS,
} from "@/lib/alert-limits";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ldJson } from "@/lib/jsonld";
import { PremiumRecoveryBeacon } from "@/components/PremiumRecoveryBeacon";

export const dynamic = "force-dynamic";

// The prices are US dollars (lib/site.ts display amounts, read from the same
// env-overridable constants as the pricing cards). "$9.99" reads as local
// dollars in AU, CA and SG, so the metadata says US$.
const usd = (amount: string) => (amount.startsWith("$") ? `US${amount}` : amount);
const PRICE_LINE = premiumAnnualEnabled()
  ? `${usd(PREMIUM_PRICE_AMOUNT)}/month or ${usd(PREMIUM_ANNUAL_AMOUNT)}/year (${usd(premiumEffectiveMonthly())}/mo)`
  : `${usd(PREMIUM_PRICE_AMOUNT)}/month`;
const TRIAL_LINE = premiumTrialEnabled() && PREMIUM_TRIAL_FEE_CENTS === 0 ? `${PREMIUM_TRIAL_DAYS} days free, ` : "";
const META_TITLE = `RiftCompare Pro: ${TRIAL_LINE ? `${PREMIUM_TRIAL_DAYS} days free, then ` : ""}${usd(PREMIUM_PRICE_AMOUNT)}/mo`;
// Premium-only while Plus is off sale (PLUS_ON_SALE, 2026-10-23).
const META_DESCRIPTION = PLUS_ON_SALE
  ? "Compare Riftbound card prices across every store, free, and track what your binder is missing. Plus and Pro watch prices for you: your own target price on cards, sealed products back in stock or at RRP, and (Pro) a whole deck's delivered total re-priced after every update, the store-by-store plan for a deck or the rest of a set, at the condition you'll play. No ads on either."
  : `The lowest delivered price for your whole Riftbound list, alerts when a card, sealed box or deck hits your price, every card below market, and no ads. ${PRICE_LINE}; ${TRIAL_LINE}cancel anytime. Comparing prices stays free.`;

export const metadata: Metadata = {
  title: META_TITLE,
  description: META_DESCRIPTION,
  alternates: pageAlternates("/premium"),
  openGraph: pageOpenGraph({ title: META_TITLE, description: META_DESCRIPTION, url: "/premium" }),
};

// The Product JSON-LD's per-tier descriptions: each names only what that tier
// really gets (TIER_COMPARISON's rows), so a rich result can't credit Plus
// with Premium's list tools or leave its ad-free benefit out.
const PLUS_OFFER_DESCRIPTION = `Plus: no ads on any page, an unlimited watchlist and portfolio (so a whole set fits in the set tracker), target-price alerts on up to ${PLUS_TARGET_ALERT_LIMIT} watched cards, sealed watches on up to ${SEALED_WATCH_LIMIT_PLUS} products (back in stock, at RRP in ${SEALED_RRP_MARKETS}, or at your price, checked ${SEALED_CHECK_CADENCE}), the full Deal Finder and Rising Cards lists, and ${FREE_PLANS_PER_MONTH} store-by-store Best Basket plans a month.`;
const PREMIUM_OFFER_DESCRIPTION = `Pro: everything in Plus, plus a deck price watch (up to ${DECK_WATCH_LIMIT} saved lists re-priced delivered after every price update, emailed at your price), unlimited target-price alerts and sealed watches, unlimited store-by-store plans for the cheapest delivered order (Best Basket, Buy this list and Finish this set, at the minimum condition you set; a free account or Plus gets ${FREE_PLANS_PER_MONTH} a month), and Demand Finder's most searched and most viewed cards.`;
const PREMIUM_STANDALONE_DESCRIPTION =
  "No ads on any page, an unlimited watchlist and portfolio, target-price alerts, sealed watches, a deck price watch, the full Deal Finder and Rising Cards lists, Best Basket's store-by-store plan, Buy this list and Demand Finder.";

// "6 Sep 2026" — same convention admin/premium/page.tsx already uses for this
// exact field, so a user's own account page and the admin's view of the same
// account never disagree on how a date reads.
const fmtDate = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

// The comparison's headline rows (PremiumTicks names; every other row sits
// under "Every other feature and limit"): what decides a purchase — free price
// comparison and the basics against Premium's delivered order, bulk pricing,
// alerts, deals, unlimited tracking with history and no ads. Best Basket and
// bulk pricing lead (2026-10-25: what members buy it for). Cells are
// TIER_COMPARISON's own.
const HEADLINE_TICK_ROWS = [
  "Compare prices across every store",
  "Best Basket & Buy this list plans",
  "Bulk price a list",
  "Finish this set plans",
  "Target-price alerts",
  "Sealed watches",
  "Deck price watch",
  "Deal Finder & Rising Cards",
  "Watchlist",
  "Portfolio",
  "Price history",
  "No ads",
];

export default async function PremiumPage({ searchParams }: { searchParams?: { keep?: string; code?: string } }) {
  const user = await getCurrentUser();
  // The visitor's market (the existing country resolution, no new geo lookup):
  // US leads with the watches, everywhere else with Best Basket.
  const market = getCountry();
  const already = isPremium(user);
  const checkoutLive = premiumCheckoutEnabled();
  const dbUser = user
    ? await prisma.user.findUnique({ where: { id: user.id }, select: { trialStartedAt: true, stripeCustomerId: true } })
    : null;
  const trialEligible = !!user && !already && (await trialOfferedTo(dbUser));
  // A brand-new account has, by definition, never started a trial before — so
  // unlike trialEligible (which requires a signed-in user to check their own
  // trialStartedAt), a signed-out visitor is trial-available on the strength
  // of premiumTrialEnabled() alone. Used to decide the pricing-card headline and
  // the signed-out CTA copy; trialEligible still gates the actual checkout
  // flow once someone is signed in.
  const trialAvailable = !already && (await trialOfferedTo(user ? dbUser : null));
  const priceNumeric = PREMIUM_PRICE_AMOUNT.replace(/[^0-9.]/g, "") || "4.99";
  const compactPrice = `${PREMIUM_PRICE_AMOUNT}/${PREMIUM_PRICE_PERIOD === "month" ? "mo" : PREMIUM_PRICE_PERIOD}`;
  const annualLive = premiumAnnualEnabled();
  const annualCompact = `${PREMIUM_ANNUAL_AMOUNT}/yr`;
  const plusLive = premiumPlusEnabled();
  const plusAnnualLive = plusAnnualEnabled();
  const plusPriceNumeric = tierMonthlyAmount("plus").replace(/[^0-9.]/g, "") || "2.99";
  // Real Stripe read, only for someone who's actually Premium right now — see
  // the function's own header for why this is a SEPARATE query from the
  // annual-switch nudge's (that one deliberately excludes trialing subs; this
  // one is a Premium user's own account and must show a trial truthfully too).
  const subDetails = already && dbUser?.stripeCustomerId ? await getPremiumSubscriptionDetails(dbUser.stripeCustomerId) : null;
  // A subscription set to end gets a one-click "Keep" (api/premium/resume).
  // The price it quotes is what keeping will really charge: the intro price
  // when resume will attach it (monthly, never paid, no discount yet — the
  // same rule as checkout), else whatever the subscription already carries.
  let keepOffer: { line: string; from: string } | null = null;
  if (subDetails?.cancelAtPeriodEnd) {
    const introOnKeep =
      introOfferEnabled() &&
      subDetails.interval === "month" &&
      subDetails.introAmountOff === 0 &&
      subDetails.unitAmount != null &&
      !(await hasEverPaid(dbUser?.stripeCustomerId));
    const line = subscriptionChargeLine({
      ...subDetails,
      introAmountOff: introOnKeep ? introAmountOffCents(subDetails.unitAmount!) : subDetails.introAmountOff,
    });
    if (line) keepOffer = { line, from: fmtDate(subDetails.currentPeriodEnd) };
  }
  const currentTier = premiumTierOf(user);
  // The half-price intro, quoted only to viewers checkout would give it to.
  const introEligible = !already && (await introEligibleFor(dbUser));
  // A creator code remembered from a creator's link (/r/CODE) or the code box
  // (lib/creator-affiliate.ts). One indexed read, only when the cookie is set.
  const savedCode = !already ? normaliseAffiliateCode(cookies().get(AFFILIATE_COOKIE)?.value) : null;
  const creator = savedCode ? await findActiveAffiliate(savedCode).catch(() => null) : null;

  return (
    <div className="mx-auto max-w-4xl">
      <PremiumRecoveryBeacon />
      <Breadcrumbs trail={[{ name: "Pro", href: "/premium" }]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson(
            {
              "@context": "https://schema.org",
              "@type": "Product",
              name: plusLive ? "RiftCompare Plus and Pro" : "RiftCompare Pro",
              description: plusLive ? `${PLUS_OFFER_DESCRIPTION} ${PREMIUM_OFFER_DESCRIPTION}` : PREMIUM_STANDALONE_DESCRIPTION,
              brand: { "@type": "Organization", name: "RiftCompare", url: SITE_URL },
              // One Offer per live tier, each describing only what THAT tier
              // gets — the old single description listed the Premium tools and
              // ad-free together, which read as though Plus had neither. An
              // array with Premium alone reads the same as the old single
              // Offer object once Plus is unconfigured.
              offers: plusLive
                ? [
                    {
                      "@type": "Offer",
                      name: "RiftCompare Plus",
                      description: PLUS_OFFER_DESCRIPTION,
                      price: plusPriceNumeric,
                      priceCurrency: "USD",
                      url: `${SITE_URL}/premium`,
                      availability: "https://schema.org/InStock",
                    },
                    {
                      "@type": "Offer",
                      name: "RiftCompare Pro",
                      description: PREMIUM_OFFER_DESCRIPTION,
                      price: priceNumeric,
                      priceCurrency: "USD",
                      url: `${SITE_URL}/premium`,
                      availability: "https://schema.org/InStock",
                    },
                  ]
                : {
                    "@type": "Offer",
                    name: "RiftCompare Pro",
                    description: PREMIUM_STANDALONE_DESCRIPTION,
                    price: priceNumeric,
                    priceCurrency: "USD",
                    url: `${SITE_URL}/premium`,
                    availability: "https://schema.org/InStock",
                  },
            },
          ),
        }}
      />

      {/* THE CONVERSION REDESIGN (2026-10-23, DECISIONS.md "/premium, rebuilt to
          convert, honestly"; supersedes the plans-first order of 2026-09-29 and
          "/premium, 70% simpler"). For a visitor who has not bought, in this
          order: the outcome headline, live stats, ONE checkout button with its
          terms; then proof they can check (today's top deals, a demo on their
          own list, the pays-for-itself line only when today's numbers support
          it); then the plans, the comparison, a sample alert and the FAQ.
          EVERY NUMBER IS LIVE OR COMPUTED from configured prices; anything
          unavailable is left out. A member sees their own tier and account
          card instead, unchanged.

          google-anno-skip keeps Google's ad-intent chips out of the sales copy
          (ad-free-boot.ts, AD_INTENTS_SKIP_CLASS). */}
      {/* /premium IS ONE PLAN TABLE AND ONE COMPARISON (2026-10-25, owner: "way
          too much going on … there doesn't need to be a repeat of information …
          we just need one [button] at the very top … a price comparison table at
          the very top … an annual and monthly plan table, and then the
          comparison between features, and that's it. Nothing else"). DECISIONS.md,
          "/premium is one plan table and one comparison". Supersedes the
          2026-10-23 conversion redesign (hero price, proof strip, deals teaser,
          savings demo, alert preview, sticky bar, FAQ): every one of them said
          again what the plan cards and the table say. A member still sees their
          own tier and account card.

          google-anno-skip keeps Google's ad-intent chips out of the sales copy
          (ad-free-boot.ts, AD_INTENTS_SKIP_CLASS). */}
      <div className="google-anno-skip">
      <div id="premium-hero" className="text-center">
        {!already && (
          <span className="chip mb-2 inline-flex bg-gold/15 text-[11px] font-extrabold uppercase tracking-widest text-gold">
            ✦ RiftCompare Pro
          </span>
        )}
        <h1 className="mx-auto max-w-3xl font-display text-3xl font-extrabold leading-tight text-white sm:text-5xl">
          {already ? `You're ${TIER_NAMES[currentTier ?? "premium"]}` : `${PREMIUM_HERO_HEADLINE}.`}
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-snug text-slate-300 sm:mt-3 sm:text-lg">
          {already ? "Thanks for supporting RiftCompare." : plusLive ? premiumHeroLine(market, plusLive) : PREMIUM_HERO_SUBLINE}
        </p>
      </div>

      {!already && (
        <>
          <PremiumPageView signedIn={!!user} />
          {/* /dashboard and MoversToolsCta link to #top-pricing. */}
          <section id="top-pricing" aria-label="Pro plans" className="scroll-mt-header mt-8">
            <CtaZone location="pricing">
              {plusLive ? (
                <PremiumPricingCards
                  plusLive={plusLive}
                  plusAnnualLive={plusAnnualLive}
                  annualLive={annualLive}
                  checkoutLive={checkoutLive}
                  signedIn={!!user}
                  trialEligible={trialEligible}
                  trialAvailable={trialAvailable}
                  trialDays={PREMIUM_TRIAL_DAYS}
                  trialFeeCents={PREMIUM_TRIAL_FEE_CENTS}
                  introEligible={introEligible}
                  market={market}
                  tickRows={HEADLINE_TICK_ROWS}
                />
              ) : (
                <PremiumPlanTable
                  annualLive={annualLive}
                  checkoutLive={checkoutLive}
                  signedIn={!!user}
                  trialEligible={trialEligible}
                  trialAvailable={trialAvailable}
                  trialDays={PREMIUM_TRIAL_DAYS}
                  trialFeeCents={PREMIUM_TRIAL_FEE_CENTS}
                  introEligible={introEligible}
                  tickRows={HEADLINE_TICK_ROWS}
                />
              )}
            </CtaZone>
            {/* The terms, said once: what happens today, the way out, who takes the money. */}
            <p className="mx-auto mt-4 max-w-2xl text-center text-xs font-semibold text-slate-400" data-premium-terms>
              Cancel anytime in two clicks · Secure payment by Stripe · Prices in US dollars
            </p>
            {/* Creator codes (2026-10-16): 20% off at checkout. Open when a code is remembered. */}
            <details className="mx-auto mt-3 max-w-md" open={!!creator || !!searchParams?.code}>
              <summary className="mx-auto w-fit cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-200">Have a creator code?</summary>
              <div className="mt-2">
                <CreatorCodeBox
                  initial={creator ? { code: creator.code, name: creator.name, percentOff: creator.percentOff } : null}
                  fromUrl={normaliseAffiliateCode(searchParams?.code)}
                />
              </div>
            </details>
          </section>
        </>
      )}

      {/* THE LOCK-IN BANNER: announced-only, below the cards, never to a
          member (DECISIONS.md, 2026-09-26). */}
      {!already && premiumPriceIncreaseAnnounced() && (
        <div className="mx-auto mt-4 max-w-2xl rounded-xl border border-gold/40 bg-gold/10 px-5 py-3 text-center">
          <p className="text-sm font-bold text-gold">{premiumLockInHeadline()}</p>
          <p className="mt-1 text-xs text-gold/80 [[data-theme=light]_&]:text-gold">
            New subscribers will pay {PREMIUM_NEXT_PRICE_AMOUNT}/{PREMIUM_PRICE_PERIOD} once the change takes
            effect. Subscribe today and keep {PREMIUM_PRICE_AMOUNT}/{PREMIUM_PRICE_PERIOD} for as long as your
            subscription stays active — no action needed later.
          </p>
        </div>
      )}
      {!already && premiumPriceIncreaseAnnounced() && (
        <p className="mx-auto mt-1 max-w-2xl text-center text-[11px] font-medium text-gold/80 [[data-theme=light]_&]:text-gold">{premiumLockInLine()}</p>
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
            <p className="mt-2 text-sm text-slate-300">Admin access — every Pro feature, no subscription required.</p>
          ) : subDetails ? (
            <div className="mt-2 space-y-1 text-sm text-slate-300">
              {/* The tier NAMED here is the effective one (currentTier), which a
                  hand-set floor can raise above what the subscription's price
                  says — a grandfathered $4.99 account really is on Pro, and
                  its own membership card is the last place that should argue. */}
              <p className="font-semibold text-white">
                {TIER_NAMES[currentTier ?? subDetails.tier]} ·{" "}
                {subDetails.status === "trialing"
                  ? subDetails.trialFeeCents > 0
                    ? `Trial · ${premiumTrialFee(subDetails.trialFeeCents)} paid`
                    : "Free trial"
                  : subDetails.interval === "year"
                  ? "Annual plan"
                  : "Monthly plan"}
              </p>
              {/* CANCELLING IS CHECKED FIRST (2026-09-24). The trial branch used
                  to come first, so a trialist who switched renewal off in the
                  portal came back to "Converts to $9.99/mo on <date>" — the
                  opposite of what they had just done. 5 of the 6 cancelled
                  trials at the time were exactly this case. */}
              <p>
                {subDetails.cancelAtPeriodEnd ? (
                  subDetails.status === "trialing" ? (
                    <>Trial ends {fmtDate(subDetails.currentPeriodEnd)} — no further charge</>
                  ) : (
                    <>Access ends {fmtDate(subDetails.currentPeriodEnd)} — won&apos;t renew</>
                  )
                ) : subDetails.status === "trialing" ? (
                  <>
                    Converts to {subscriptionChargeLine(subDetails) ?? (subDetails.interval === "year" ? annualCompact : compactPrice)} on{" "}
                    {fmtDate(subDetails.currentPeriodEnd)}
                  </>
                ) : (
                  <>Renews {fmtDate(subDetails.currentPeriodEnd)}</>
                )}
              </p>
              {/* Also the EFFECTIVE tier, so a grandfathered account is never
                  offered an "upgrade" to something it already has — and a
                  floored account is never offered a downgrade that its floor
                  would silently undo. Both would be real money changing hands
                  for no change in access. */}
              {/* A grandfathered Plus member: Premium access, Plus price. */}
              {subDetails.tier === "plus" && currentTier === "premium" && (
                <p className="text-xs text-slate-400" data-plus-grandfathered>
                  You keep your original Plus price, with everything in Pro included.
                </p>
              )}
              <SubscriptionActions
                tier={currentTier ?? subDetails.tier}
                interval={subDetails.interval}
                plusLive={plusLive && !user.premiumTierFloor}
                upgradeLive={plusConfigured() && !user.premiumTierFloor}
                annualAvailable={subDetails.tier === "plus" ? plusAnnualLive : annualLive}
                targetAnnualAvailable={(currentTier ?? subDetails.tier) === "plus" ? annualLive : plusAnnualLive}
                canManageBilling={checkoutLive}
                trialing={subDetails.status === "trialing"}
                keep={keepOffer}
                highlightKeep={searchParams?.keep === "1"}
              />
            </div>
          ) : user.premiumUntil ? (
            // A comp grant — no Stripe subscription behind it, so there is no
            // plan or renewal to describe, only the date it runs to. It DOES
            // have a tier though (grantPremiumDays stamps one), and saying
            // "Premium" at a Plus comp was simply wrong.
            <p className="mt-2 text-sm text-slate-300">
              {TIER_NAMES[currentTier ?? "premium"]} until {fmtDate(user.premiumUntil)}
            </p>
          ) : null}
        </div>
      )}

      {/* Member quick links — only what this member can actually open. Best
          Basket's plan and Demand Finder are dropped for a Plus member rather than left to bounce
          them into an upsell wall from their own membership page; the upgrade
          path is the SubscriptionActions card above, which states the price. */}
      {already && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
          <Link href="/dashboard" className="btn-primary">◆ Your dashboard</Link>
          <Link href="/tools/deal-finder" className="btn-ghost">Deal Finder</Link>
          <Link href="/tools/rising" className="btn-ghost">Rising Cards</Link>
          <Link href="/watching" className="btn-ghost">Watchlist &amp; target alerts</Link>
          <Link href="/tools/best-basket" className="btn-ghost">Best Basket</Link>
          {currentTier !== "plus" && <Link href="/tools/demand" className="btn-ghost">Demand Finder</Link>}
          <Link href="/portfolio" className="btn-ghost">Portfolio</Link>
          <Link href="/portfolio/sets" className="btn-ghost">Set checklist</Link>
          {checkoutLive && <ManageSubscriptionButton />}
        </div>
      )}

      {/* A Plus member sees what Premium adds, as the same ticks. */}
      {already && currentTier === "plus" && (
        <section className="mx-auto mt-8 max-w-3xl" aria-label="What Pro adds">
          <PremiumTicks showPlus prices={{ plus: `${tierMonthlyAmount("plus")}/mo`, premium: `${PREMIUM_PRICE_AMOUNT}/mo` }} you="plus" selected="premium" />
        </section>
      )}

      {/* Footer note: members only (the sales page is the table and nothing else). */}
      {already && (
      <p className="mx-auto mt-8 max-w-xl text-center text-xs leading-relaxed text-slate-500">
        {already ? (
          <>Update your card or cancel anytime via &ldquo;Manage subscription&rdquo; above. </>
        ) : null}
        <Link href="/blog/riftcompare-premium-explained" className="text-slate-400 hover:underline">Every feature, explained</Link>
        {" · "}
        <Link href="/contact" className="text-slate-400 hover:underline">Get in touch</Link>
      </p>
      )}
      </div>
    </div>
  );
}
