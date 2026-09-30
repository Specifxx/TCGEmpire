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
  subscriptionChargeLine,
  hasEverPaid,
  introEligibleFor,
  PREMIUM_TRIAL_DAYS,
  PREMIUM_TRIAL_FEE_CENTS,
} from "@/lib/premium";
import { PremiumPricingCards } from "@/components/PremiumPricingCards";
import { ManageSubscriptionButton } from "@/components/ManageSubscriptionButton";
import { SubscriptionActions } from "@/components/SubscriptionActions";
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
  premiumLockInHeadline,
  introFromLine,
  premiumTrialFee,
  introOfferEnabled,
  introPriceLine,
  introAmountOffCents,
  tierIntroMonthlyAmount,
  INTRO_MONTHS,
  type PremiumTierKey,
} from "@/lib/site";
import { DECK_WATCH_LIMIT, PLUS_TARGET_ALERT_LIMIT, SEALED_CHECK_CADENCE, SEALED_RRP_MARKETS, SEALED_WATCH_LIMIT_PLUS } from "@/lib/alert-limits";
import { FREE_PORTFOLIO_LIMIT, FREE_WATCHLIST_LIMIT } from "@/lib/free-limits";
import { pageAlternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { faqPage, ldJson } from "@/lib/jsonld";
import { PremiumRecoveryBeacon } from "@/components/PremiumRecoveryBeacon";
import { PremiumProofLine } from "@/components/PremiumProofLine";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "RiftCompare Premium — never overpay for a Riftbound card",
  description: "Compare Riftbound card prices across every store, free, and track what your binder is missing. Plus and Premium watch prices for you: your own target price on cards, sealed products back in stock or at RRP, and (Premium) a whole deck's delivered total re-priced after every update, the store-by-store plan for a deck or the rest of a set, at the condition you'll play. No ads on either.",
  alternates: pageAlternates("/premium"),
};

// WHAT YOU GET (2026-09-29, owner: "way too wordy now"). One line per feature, in
// plain words, grouped by the tier that FIRST includes it. It replaced the four
// persona sections and the eleven per-feature paragraph cards (about 2,600
// words); the table below has the full accounting and the FAQ the definitions.
// Every number is the enforced constant (free-limits.ts, alert-limits.ts), never
// typed. Nothing here predicts a price, names a saving, counts down or says
// "worth": the only saving figure on the site is Best Basket's own computed one
// on the viewer's own list. A feature is listed only when it is live. `href` is
// where a MEMBER who has the feature can open it (never a wall: a Plus member is
// not linked to a Premium tool); a visitor who has not bought sees plain text.
type WhatYouGet = { text: string; href: string; tier: "free" | "plus" | "premium" };
const WHAT_YOU_GET: WhatYouGet[] = [
  { tier: "free", text: "Compare prices across every store, always free", href: "/browse" },
  { tier: "free", text: `Watch ${FREE_WATCHLIST_LIMIT} cards, with weekly new-low emails`, href: "/watching" },
  { tier: "free", text: `Portfolio of ${FREE_PORTFOLIO_LIMIT} cards, with its replacement cost`, href: "/portfolio" },
  { tier: "free", text: "Set checklist: what's missing, cheapest listing to finish", href: "/portfolio/sets" },
  { tier: "free", text: "Top 3 of Deal Finder and Rising Cards", href: "/tools/deal-finder" },
  { tier: "free", text: "Deck pricer, trade calculator and box EV", href: "/deck" },
  { tier: "free", text: "Best Basket: your own list's total", href: "/tools/best-basket" },
  { tier: "plus", text: "No ads, on the website and in the app", href: "/dashboard" },
  { tier: "plus", text: "No watchlist or portfolio limit, so whole sets fit", href: "/portfolio/sets" },
  { tier: "plus", text: `Target-price alerts on up to ${PLUS_TARGET_ALERT_LIMIT} cards`, href: "/watching" },
  { tier: "plus", text: `Sealed watches for ${SEALED_WATCH_LIMIT_PLUS} products: restock, RRP, your price`, href: "/sealed" },
  { tier: "plus", text: "Full Deal Finder and Rising Cards lists", href: "/tools/deal-finder" },
  { tier: "premium", text: "Unlimited target-price alerts and sealed watches", href: "/watching" },
  { tier: "premium", text: `Deck price watch: ${DECK_WATCH_LIMIT} saved lists, emailed at your price`, href: "/tools/best-basket" },
  { tier: "premium", text: "Best Basket: which store to buy each card from", href: "/tools/best-basket" },
  { tier: "premium", text: "Finish this set: a store plan for what's missing", href: "/portfolio/sets" },
  { tier: "premium", text: "Minimum condition, so no heavily played copies", href: "/tools/best-basket" },
  // Demand Finder stays Premium but sits last and is described as what it counts:
  // searches, never "what to buy before it spikes" (2026-09-29, the personas pass).
  { tier: "premium", text: "Demand Finder: what players search for and open most", href: "/tools/demand" },
];

// The Product JSON-LD's per-tier descriptions: each names only what that tier
// really gets (TIER_COMPARISON's rows), so a rich result can't credit Plus
// with Premium's list tools or leave its ad-free benefit out.
const PLUS_OFFER_DESCRIPTION = `Plus: no ads on any page, an unlimited watchlist and portfolio (so a whole set fits in the set tracker), target-price alerts on up to ${PLUS_TARGET_ALERT_LIMIT} watched cards, sealed watches on up to ${SEALED_WATCH_LIMIT_PLUS} products (back in stock, at RRP or at your price, checked ${SEALED_CHECK_CADENCE}), and the full Deal Finder and Rising Cards lists.`;
const PREMIUM_OFFER_DESCRIPTION = `Premium: everything in Plus, plus a deck price watch (up to ${DECK_WATCH_LIMIT} saved lists re-priced delivered after every price update, emailed at your price), unlimited target-price alerts and sealed watches, Best Basket's store-by-store plan for the cheapest delivered order (at the minimum condition you set), Buy this list for a deck, watchlist or binder, the store-by-store plan for what a set is missing, and Demand Finder's most searched and most viewed cards.`;
const PREMIUM_STANDALONE_DESCRIPTION =
  "No ads on any page, an unlimited watchlist and portfolio, target-price alerts, sealed watches, a deck price watch, the full Deal Finder and Rising Cards lists, Best Basket's store-by-store plan, Buy this list and Demand Finder.";

// "6 Sep 2026" — same convention admin/premium/page.tsx already uses for this
// exact field, so a user's own account page and the admin's view of the same
// account never disagree on how a date reads.
const fmtDate = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

// The FAQ, seven questions and answers of about forty words (2026-09-29, owner:
// "way too wordy"; it was twenty-odd questions and ~2,000 words). The Plus/Premium
// definitions moved into the "What you get" list, one line each. Every answer is
// built from the SAME site.ts / premium.ts / limits constants the rest of the page
// uses, never a second hand-typed copy, so a price or limit change can't leave
// this FAQ quietly wrong. Rendered visibly AND as FAQPage JSON-LD from THIS array
// (Google honours the schema only when the same Q&A is on the page). The three
// questions behind a switch (a trial, the half-price offer, an announced price
// rise) exist only while that switch is on, so they are the disclosure for it and
// the live page carries seven.
const FAQ: { q: string; a: string }[] = [
  {
    q: "I'm new — what do I actually get?",
    a: `Price comparison is free for everyone, with no limit. A free account adds a watchlist (${FREE_WATCHLIST_LIMIT} cards), a portfolio (${FREE_PORTFOLIO_LIMIT}) and a set checklist. Plus and Premium watch prices for you and email when your number is met.`,
  },
  ...(premiumTrialEnabled()
    ? [
        {
          q: PREMIUM_TRIAL_FEE_CENTS > 0 ? `How do the first ${PREMIUM_TRIAL_DAYS} days for ${premiumTrialFee(PREMIUM_TRIAL_FEE_CENTS)} work?` : `How does the ${PREMIUM_TRIAL_DAYS}-day free trial work?`,
          // Charged-today first, then the plan price, then the way out; never "free"
          // while the fee is above zero, and no refund promise either way.
          a: `${PREMIUM_TRIAL_FEE_CENTS > 0 ? `You pay ${premiumTrialFee(PREMIUM_TRIAL_FEE_CENTS)} today and everything in your plan unlocks for ${PREMIUM_TRIAL_DAYS} days.` : `Everything in your plan unlocks at once and nothing is charged today.`} A card is required. We email you a day or two before day ${PREMIUM_TRIAL_DAYS}, then ${
            introOfferEnabled()
              ? `${premiumPlusEnabled() ? `${introPriceLine("plus")} for Plus or ` : ""}${introPriceLine("premium")}${premiumPlusEnabled() ? " for Premium" : ""} on the monthly plan`
              : `${premiumPlusEnabled() ? `${tierMonthlyAmount("plus")}/${PREMIUM_PRICE_PERIOD} for Plus or ` : ""}${PREMIUM_PRICE_AMOUNT}/${PREMIUM_PRICE_PERIOD}${premiumPlusEnabled() ? " for Premium" : ""}`
          } (${introFromLine()}), or the annual rate, unless you cancel first from this page. Cancel before day ${PREMIUM_TRIAL_DAYS} and the plan price is never charged; you keep access to day ${PREMIUM_TRIAL_DAYS} either way.`,
        },
      ]
    : []),
  ...(introOfferEnabled()
    ? [
        {
          q: `What is the half-price offer?`,
          a: `New subscribers on a monthly plan pay half price for their first ${INTRO_MONTHS} months (${tierIntroMonthlyAmount("premium")}/mo for Premium${premiumPlusEnabled() ? `, ${tierIntroMonthlyAmount("plus")}/mo for Plus` : ""}), applied automatically at checkout. Annual plans keep their normal price.`,
        },
      ]
    : []),
  {
    q: "How do I cancel?",
    a: `Use "Manage subscription" on this page to open Stripe's billing portal and cancel in a couple of clicks. You keep access until the end of the period you paid for${
      premiumTrialEnabled() ? ` (cancel before day ${PREMIUM_TRIAL_DAYS} of a trial and the plan price is never charged)` : ""
    }.`,
  },
  {
    q: "Is Plus really ad-free?",
    a: `Yes. Plus and Premium both remove every ad, on the website and in the app, from the moment you subscribe${premiumPlusEnabled() ? `. At ${tierMonthlyAmount("plus")}/mo Plus is the cheapest way to browse without ads` : ""}.`,
  },
  {
    q: "What happens to cards I already track?",
    a: `You keep them all. The free limits (${FREE_WATCHLIST_LIMIT} watched cards, ${FREE_PORTFOLIO_LIMIT} portfolio cards) only stop you adding a NEW card, and nothing is deleted if a subscription ends. Only a new card needs ${premiumPlusEnabled() ? "Plus" : "Premium"}.`,
  },
  {
    q: "Do I have to pay to see what my set is missing?",
    a: `No. A free account can tick up to ${FREE_PORTFOLIO_LIMIT} cards, see its progress and the missing list, and export it. Plus removes the ${FREE_PORTFOLIO_LIMIT}-card limit so a whole set fits.`,
  },
  {
    q: "What does minimum condition do?",
    a: "Premium only. Best Basket, Buy this list and the deck price watch use just the listings at or above the grade you choose. A card with none in stock at that grade shows as not covered.",
  },
  {
    q: "Do you predict prices or tell me when to buy?",
    a: "No. Rising Cards and Deal Finder show what stores charge today, and Demand Finder shows what people are searching for. Watches only tell you when a price, restock or listing matches something you set.",
  },
  // Only while a real, higher price is announced (2026-09-26): with none
  // decided, the old answer ("the price goes up as the site grows, your rate
  // doesn't") promised protection from a rise that isn't coming, days after
  // the price was cut and existing subscribers were moved onto the new one.
  ...(premiumPriceIncreaseAnnounced()
    ? [
        {
          q: "Does my price ever go up?",
          a: premiumLockInLine(),
        },
      ]
    : []),
];

export default async function PremiumPage({ searchParams }: { searchParams?: { keep?: string } }) {
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
              name: plusLive ? "RiftCompare Plus and Premium" : "RiftCompare Premium",
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
                      name: "RiftCompare Premium",
                      description: PREMIUM_OFFER_DESCRIPTION,
                      price: priceNumeric,
                      priceCurrency: "USD",
                      url: `${SITE_URL}/premium`,
                      availability: "https://schema.org/InStock",
                    },
                  ]
                : {
                    "@type": "Offer",
                    name: "RiftCompare Premium",
                    description: PREMIUM_STANDALONE_DESCRIPTION,
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

      {/* PLANS FIRST (2026-09-29, owner: "way too wordy now and the buttons to get
          premium are at the bottom of the page and you have to scroll"). Above
          the fold, in this order: one line, one short subline, the Monthly /
          Annual toggle (monthly by default) and the two plan cards with their
          buy buttons, at 390x844 and at 1280x720. Nothing else sits between the
          heading and the buttons for a visitor who has not bought: no chip, no
          second subline, no proof line, no persona section. What you get, the
          table and the FAQ follow, compact, below. A member sees their own tier
          and account card in this same spot instead of the cards. The hero says
          what is free before what is paid and quotes no price or saving figure. */}
      <div className="text-center">
        <h1 className="font-display text-2xl font-extrabold leading-tight text-white sm:text-4xl">
          {already ? `You're ${TIER_NAMES[currentTier ?? "premium"]}` : "Know what you're missing. Buy it for less."}
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-snug text-slate-300 sm:mt-3 sm:text-base">
          {already
            ? "Everything you've unlocked is below. Thanks for supporting RiftCompare."
            : plusLive
            ? "Comparing prices is free. Plus and Premium watch prices and stock for you, ad-free."
            : "Comparing prices is free. Premium watches prices and stock for you, ad-free."}
        </p>
      </div>

      {/* Pricing */}
      {/* THE LOCK-IN BANNER: only while a real, higher price is announced
          (premiumPriceIncreaseAnnounced — NEXT_PUBLIC_PREMIUM_NEXT_PRICE_AMOUNT
          set above today's price), and now BELOW the cards so it can never push
          the buttons off the first screen. From 2026-09-22 it rendered in both
          states, the steady one saying "the price goes up as the site grows,
          your rate doesn't". On 2026-09-26 the owner CUT the price and moved
          existing subscribers down onto the new Prices, so that copy promised
          protection from a rise nobody had decided — retired, see lib/site.ts's
          lock-in block and DECISIONS.md, 2026-09-26.

          It stays inside the `!already` gate: someone who is already a member
          has nothing to "lock in", and the banner would read as a threat to
          the rate they already hold. */}
      {!already && (
        <>
          {/* /dashboard and MoversToolsCta link here. scroll-mt-header is the
              header-aware anchor offset (globals.css). */}
          <div id="top-pricing" className="scroll-mt-header mt-3 sm:mt-6">
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
            />
          </div>

          <p className="mx-auto mt-3 max-w-2xl text-center text-[11px] text-slate-400">
            {user ? "Cancel anytime · secure checkout by Stripe" : "Sign in on the next screen, checkout opens straight after · Cancel anytime · secure checkout by Stripe"}
          </p>
        </>
      )}

      {!already && (
        <>
          {premiumPriceIncreaseAnnounced() && (
            <div className="mx-auto mt-4 max-w-2xl rounded-xl border border-gold/40 bg-gold/10 px-5 py-3 text-center">
              <p className="text-sm font-bold text-gold">{premiumLockInHeadline()}</p>
              <p className="mt-1 text-xs text-gold/80 [[data-theme=light]_&]:text-gold">
                New subscribers will pay {PREMIUM_NEXT_PRICE_AMOUNT}/{PREMIUM_PRICE_PERIOD} once the change takes
                effect. Subscribe today and keep {PREMIUM_PRICE_AMOUNT}/{PREMIUM_PRICE_PERIOD} for as long as your
                subscription stays active — no action needed later.
              </p>
            </div>
          )}
          {premiumPriceIncreaseAnnounced() && (
            <p className="mx-auto mt-1 max-w-2xl text-center text-[11px] font-medium text-gold/80 [[data-theme=light]_&]:text-gold">{premiumLockInLine()}</p>
          )}

          {/* Client island, renders nothing until it resolves — see its own
              comment. Below the cards, so its arrival never moves a button. */}
          <PremiumProofLine />
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
              {/* The tier NAMED here is the effective one (currentTier), which a
                  hand-set floor can raise above what the subscription's price
                  says — a grandfathered $4.99 account really is on Premium, and
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
              <SubscriptionActions
                tier={currentTier ?? subDetails.tier}
                interval={subDetails.interval}
                plusLive={plusLive && !user.premiumTierFloor}
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
          {currentTier !== "plus" && <Link href="/tools/best-basket" className="btn-ghost">Best Basket</Link>}
          {currentTier !== "plus" && <Link href="/tools/demand" className="btn-ghost">Demand Finder</Link>}
          <Link href="/portfolio" className="btn-ghost">Portfolio</Link>
          <Link href="/portfolio/sets" className="btn-ghost">Set checklist</Link>
          {checkoutLive && <ManageSubscriptionButton />}
        </div>
      )}

      {/* WHAT YOU GET — one line per feature, grouped by the tier that first
          includes it, two columns from sm up. Replaces the persona sections and
          the per-feature cards (owner, 2026-09-29). */}
      <section className="mt-8" aria-labelledby="what-you-get">
        <h2 id="what-you-get" className="mb-3 text-center text-lg font-extrabold text-white">What you get</h2>
        <div className="space-y-4">
          {(plusLive
            ? (["free", "plus", "premium"] as const)
            : (["free", "premium"] as const)
          ).map((group) => {
            const items = WHAT_YOU_GET.filter((f) => (plusLive ? f.tier === group : group === "free" ? f.tier === "free" : f.tier !== "free"));
            const heading =
              group === "free"
                ? "Free account"
                : `${TIER_NAMES[group]} · ${tierMonthlyAmount(group)}/mo`;
            const includes = group === "free" ? (user ? "" : "no card needed") : group === "plus" ? "everything in Free, and" : plusLive ? "everything in Plus, and" : "everything in Free, and";
            return (
              <div key={group} className="card-surface rounded-xl border border-ink-700 p-3 sm:p-4">
                <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
                  <h3 className={`text-sm font-extrabold ${group === "premium" ? "text-gold" : "text-white"}`}>{heading}</h3>
                  <span className="text-xs text-slate-500">{includes}</span>
                  {group === "free" && !user && (
                    <Link href="/login?next=/premium" className="ml-auto text-xs font-semibold text-brand-400 hover:underline">
                      Create a free account →
                    </Link>
                  )}
                </div>
                <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] text-slate-300 sm:grid-cols-2">
                  {items.map((f) => {
                    const canOpen = already && (f.tier !== "premium" || currentTier !== "plus");
                    return (
                      <li key={f.text} className="flex items-start gap-2 [font-feature-settings:'lnum'_1]">
                        <span className={`font-bold ${group === "premium" ? "text-gold" : "text-brand-400"}`}>✓</span>
                        {canOpen ? (
                          <Link href={f.href} className="hover:text-white hover:underline">{f.text}</Link>
                        ) : (
                          <span>{f.text}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">
          RRP is the price Riot sets, shown for {SEALED_RRP_MARKETS}. Delivered means item price plus postage. Sealed products are
          checked {SEALED_CHECK_CADENCE}.
        </p>
      </section>

      {/* Feature comparison — collapsed, and still in the server HTML (a closed
          <details> keeps its content in the document). */}
      <details className="card-surface mt-8 rounded-xl border border-ink-700">
        <summary className="cursor-pointer p-4 text-center text-sm font-bold text-white">Compare every feature</summary>
        <div className="px-1 pb-2">
          <TierComparisonTable showPlus={plusLive} tinted />
        </div>
      </details>

      {/* FAQ — rendered visibly (not just as JSON-LD above) so Google honours
          the FAQPage markup. Collapsed, every answer a few lines. */}
      <section className="mt-8" aria-labelledby="premium-faq">
        <h2 id="premium-faq" className="mb-3 text-center text-lg font-extrabold text-white">Questions</h2>
        <div className="mx-auto max-w-2xl space-y-2">
          {/* p-3 sits on the <summary>, not the <details>, so the whole card is
              the toggle: a tap in the padding band used to hit the details box
              and do nothing (2026-09-23). The native marker stays. */}
          {FAQ.map((f) => (
            <details key={f.q} className="card-surface rounded-xl border border-ink-700">
              <summary className="cursor-pointer p-3 text-sm font-semibold text-white">{f.q}</summary>
              <p className="px-3 pb-3 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">
          Every feature in detail:{" "}
          <Link href="/blog/riftcompare-premium-explained" className="text-brand-400 hover:underline">
            RiftCompare Plus and Premium, explained
          </Link>
          .
        </p>
      </section>

      {/* Footer note */}
      <p className="mx-auto mt-6 max-w-xl text-center text-xs leading-relaxed text-slate-500">
        {already ? (
          <>Update your card or cancel anytime via &ldquo;Manage subscription&rdquo; above. </>
        ) : trialAvailable ? (
          <>
            The {PREMIUM_TRIAL_FEE_CENTS > 0 ? `${premiumTrialFee(PREMIUM_TRIAL_FEE_CENTS)} trial` : "free trial"} needs a card and converts to the plan you picked
            {plusLive ? <> — {tierMonthlyAmount("plus")}/{PREMIUM_PRICE_PERIOD} for Plus, {PREMIUM_PRICE_AMOUNT}/{PREMIUM_PRICE_PERIOD} for Premium</> : <> ({PREMIUM_PRICE_AMOUNT}/{PREMIUM_PRICE_PERIOD})</>}
            {" "}after {PREMIUM_TRIAL_DAYS} day{PREMIUM_TRIAL_DAYS === 1 ? "" : "s"} unless you cancel first
            {introEligible ? <> — at half price for the first {INTRO_MONTHS} months on a monthly plan</> : null}. We email
            you a day or two before you&apos;re charged.{" "}
          </>
        ) : null}
        <Link href="/contact" className="text-slate-400 hover:underline">Questions? Get in touch</Link>.
      </p>
    </div>
  );
}
