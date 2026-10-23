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
  FEEDBACK_PREMIUM_DAYS,
  REFERRAL_PREMIUM_DAYS,
} from "@/lib/premium";
import { getCountry } from "@/lib/get-country";
import { premiumHeroLine, PREMIUM_HERO_HEADLINE, PREMIUM_HERO_SUBLINE } from "@/lib/premium-plan-copy";
import { PremiumProofStrip, type PremiumProof } from "@/components/premium/PremiumValue";
import { PremiumDealsTeaser } from "@/components/premium/PremiumDealsTeaser";
import { PremiumSavingsDemo } from "@/components/premium/PremiumSavingsDemo";
import { PremiumAlertPreview } from "@/components/premium/PremiumAlertPreview";
import { CtaZone, PremiumFaqList, PremiumPageView, PremiumStickyCta } from "@/components/premium/PremiumPageClient";
import { PremiumCta } from "@/components/PremiumCta";
import { paysForItself, teaserDeals } from "@/lib/premium-page";
import { PREMIUM_TESTIMONIALS } from "@/lib/content/premium-testimonials";
import { formatMoney } from "@/lib/format";
import { STORE_PLAN_AMOUNT } from "@/lib/store-plan";
import { getHomeStats } from "@/lib/home-stats";
import { getCachedTopDeals } from "@/lib/top-deals";
import { COUNTRIES } from "@/lib/country";
import { FREE_PLANS_PER_MONTH } from "@/lib/basket-meter";
import { PremiumPricingCards } from "@/components/PremiumPricingCards";
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
  tierAnnualAmount,
  premiumPriceIncreaseAnnounced,
  premiumLockInLine,
  premiumLockInHeadline,
  introFromLine,
  premiumTrialFee,
  premiumEffectiveMonthly,
  annualSavingPct,
  trialButtonLabel,
  introOfferEnabled,
  introPriceLine,
  introAmountOffCents,
  tierIntroMonthlyAmount,
  INTRO_MONTHS,
  type PremiumTierKey,
} from "@/lib/site";
import {
  DECK_WATCH_LIMIT,
  FREE_SEALED_WATCH_LIMIT,
  FREE_TARGET_ALERT_LIMIT,
  PLUS_TARGET_ALERT_LIMIT,
  SEALED_CHECK_CADENCE,
  SEALED_RRP_MARKETS,
  SEALED_WATCH_LIMIT_PLUS,
} from "@/lib/alert-limits";
import { FREE_PORTFOLIO_LIMIT, FREE_WATCHLIST_LIMIT } from "@/lib/free-limits";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { faqPage, ldJson } from "@/lib/jsonld";
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
const META_TITLE = `RiftCompare Premium: ${TRIAL_LINE ? `${PREMIUM_TRIAL_DAYS} days free, then ` : ""}${usd(PREMIUM_PRICE_AMOUNT)}/mo`;
// Premium-only while Plus is off sale (PLUS_ON_SALE, 2026-10-23).
const META_DESCRIPTION = PLUS_ON_SALE
  ? "Compare Riftbound card prices across every store, free, and track what your binder is missing. Plus and Premium watch prices for you: your own target price on cards, sealed products back in stock or at RRP, and (Premium) a whole deck's delivered total re-priced after every update, the store-by-store plan for a deck or the rest of a set, at the condition you'll play. No ads on either."
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
const PREMIUM_OFFER_DESCRIPTION = `Premium: everything in Plus, plus a deck price watch (up to ${DECK_WATCH_LIMIT} saved lists re-priced delivered after every price update, emailed at your price), unlimited target-price alerts and sealed watches, unlimited store-by-store plans for the cheapest delivered order (Best Basket, Buy this list and Finish this set, at the minimum condition you set; a free account or Plus gets ${FREE_PLANS_PER_MONTH} a month), and Demand Finder's most searched and most viewed cards.`;
const PREMIUM_STANDALONE_DESCRIPTION =
  "No ads on any page, an unlimited watchlist and portfolio, target-price alerts, sealed watches, a deck price watch, the full Deal Finder and Rising Cards lists, Best Basket's store-by-store plan, Buy this list and Demand Finder.";

// "6 Sep 2026" — same convention admin/premium/page.tsx already uses for this
// exact field, so a user's own account page and the admin's view of the same
// account never disagree on how a date reads.
const fmtDate = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

// The FAQ (2026-10-17, owner: "way too convoluted… seventy percent simpler"):
// four questions, plus the ones that exist only while their switch is on (a
// trial, the half-price offer, an announced price rise), which are the
// disclosure for it. What each plan includes is the ticks table, said once, so
// no answer here restates a plan. Every answer is built from the SAME site.ts /
// premium.ts / limits constants the rest of the page uses, and it is rendered
// visibly AND as FAQPage JSON-LD from THIS array (Google honours the schema only
// when the same Q&A is on the page).
// The FAQ (2026-10-17, owner: "way too convoluted… seventy percent simpler").
// REORDERED 2026-10-23 (the conversion redesign, DECISIONS.md "/premium, rebuilt
// to convert, honestly"): the trial and cancel answers first, since they are
// what a buyer checks before a card goes in, then the honest "only a few cards?"
// answer, then the rest. Every answer is still built from the SAME site.ts /
// premium.ts / limits constants the rest of the page uses, and rendered visibly
// AND as FAQPage JSON-LD from THIS array. `id` is the anchor (#faq-<id>) and the
// analytics key (premium_faq_open), never free text.
const FAQ: { id: string; q: string; a: string }[] = [
  ...(premiumTrialEnabled()
    ? [
        {
          id: "trial",
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
  {
    id: "cancel",
    q: "How do I cancel?",
    a: `Use "Manage subscription" on this page to open Stripe's billing portal and cancel in a couple of clicks. You keep access until the end of the period you paid for${
      premiumTrialEnabled() ? ` (cancel before day ${PREMIUM_TRIAL_DAYS} of a trial and the plan price is never charged)` : ""
    }.`,
  },
  {
    id: "few-cards",
    q: "Is Premium worth it if I only buy a few cards?",
    // Honest by design: for a light buyer the free tools may be enough, and
    // the answer says so (2026-10-23, the conversion redesign).
    a: `Maybe not, and that's fine. Comparing prices is free with no limit, and a free account gets ${FREE_PLANS_PER_MONTH} store-by-store Best Basket plans a month, ${FREE_TARGET_ALERT_LIMIT} card price alert and ${FREE_SEALED_WATCH_LIMIT} sealed watch, which can be all a few singles a month needs. Premium earns its price when you buy whole decks or long lists (where splitting the order and counting each store's postage makes the most difference), when you want alerts on many cards, boxes or decks, or when you hunt below-market deals.${
      premiumTrialEnabled() && PREMIUM_TRIAL_FEE_CENTS === 0 ? ` Price your own list first (in the demo on this page, or with the free Best Basket plans), or try it free for ${PREMIUM_TRIAL_DAYS} days and cancel if it doesn't pay for itself.` : " Price your own list first, in the demo on this page or with the free Best Basket plans."
    }`,
  },
  {
    id: "free",
    q: "What's free?",
    a: `Comparing prices is free for everyone, with no limit. A free account adds a watchlist (${FREE_WATCHLIST_LIMIT} cards), a portfolio (${FREE_PORTFOLIO_LIMIT}), a set checklist and ${FREE_PLANS_PER_MONTH} store-by-store Best Basket plans a month.`,
  },
  {
    id: "comparison-free",
    q: "Is price comparison free?",
    a: `Yes, entirely. Searching, browsing every card, comparing live prices across every store and eBay, the deck builder and list pricer, trade calculator, box EV calculator, the RiftCompare Index and price movers are all free with no account at all. ${PLUS_ON_SALE ? "Plus and Premium are" : "Premium is"} about no ads, the full deal lists, the watches that run for you, and the list tools.`,
  },
  ...(FEEDBACK_PREMIUM_DAYS > 0 || REFERRAL_PREMIUM_DAYS > 0
    ? [
        {
          id: "earn-free",
          q: "Can I get Premium for free?",
          a: [
            "You can earn free Premium, no card required:",
            FEEDBACK_PREMIUM_DAYS > 0 ? `submit feedback once at riftcompare.com/feedback and it unlocks ${FEEDBACK_PREMIUM_DAYS === 7 ? "a full week" : `${FEEDBACK_PREMIUM_DAYS} days`} automatically` : "",
            FEEDBACK_PREMIUM_DAYS > 0 && REFERRAL_PREMIUM_DAYS > 0 ? "or" : "",
            REFERRAL_PREMIUM_DAYS > 0 ? `share your referral link from your profile and every friend who creates a free account earns you ${REFERRAL_PREMIUM_DAYS} days` : "",
          ]
            .filter(Boolean)
            .join(" ")
            .replace(/: or /, ": ") + ".",
        },
      ]
    : []),
  {
    // Addressed to a CURRENT Plus member: Plus is off sale since 2026-10-23
    // but its grandfathered members keep it and can still move up.
    id: "plus",
    // While Plus is off sale its members get every Premium feature at their
    // Plus price (lib/premium.ts effectiveTier, 2026-10-23), so there is
    // nothing to switch to: the answer says what they now have.
    q: PLUS_ON_SALE ? "Can I switch from Plus to Premium?" : "I'm on Plus. What happens to my plan?",
    a: PLUS_ON_SALE
      ? `Yes, from this page once you're subscribed: "Upgrade to Premium" switches your plan straight away, on the same monthly or annual cycle, and bills only the difference for the rest of the period you've paid for. During a free trial the switch opens once the trial has converted.`
      : "Plus is no longer sold, and you now get everything in Premium at the Plus price you already pay, for as long as you stay subscribed. There's nothing to do and nothing changes on your bill.",
  },
  {
    id: "tracked",
    q: "What happens to cards I already track?",
    a: `You keep them all. The free limits (${FREE_WATCHLIST_LIMIT} watched cards, ${FREE_PORTFOLIO_LIMIT} portfolio cards) only stop you adding a NEW card, and nothing is deleted if a subscription ends. Only a new card needs ${premiumPlusEnabled() ? "Plus" : "Premium"}.`,
  },
  ...(introOfferEnabled()
    ? [
        {
          id: "intro",
          q: `What is the half-price offer?`,
          a: `New subscribers on a monthly plan pay half price for their first ${INTRO_MONTHS} months (${tierIntroMonthlyAmount("premium")}/mo for Premium${premiumPlusEnabled() ? `, ${tierIntroMonthlyAmount("plus")}/mo for Plus` : ""}), applied automatically at checkout. Annual plans keep their normal price.`,
        },
      ]
    : []),
  // Only while a real, higher price is announced (2026-09-26): with none
  // decided, the old answer ("the price goes up as the site grows, your rate
  // doesn't") promised protection from a rise that isn't coming, days after
  // the price was cut and existing subscribers were moved onto the new one.
  ...(premiumPriceIncreaseAnnounced()
    ? [
        {
          id: "price-rise",
          q: "Does my price ever go up?",
          a: premiumLockInLine(),
        },
      ]
    : []),
];

// The comparison's headline rows (PremiumTicks names; every other row sits
// under "Every other feature and limit"): what decides a purchase — free price
// comparison and the basics against Premium's delivered order, alerts, deals,
// unlimited tracking with history and no ads. Cells are TIER_COMPARISON's own.
const HEADLINE_TICK_ROWS = [
  "Compare prices across every store",
  "Best Basket & Buy this list plans",
  "Target-price alerts",
  "Sealed watches",
  "Deck price watch",
  "Deal Finder & Rising Cards",
  "Watchlist",
  "Portfolio",
  "Price history",
  "No ads",
];

// "six markets", from the markets the site really prices (lib/country.ts).
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const MARKET_COUNT = Object.keys(COUNTRIES).length;
const MARKET_COUNT_WORD = NUMBER_WORDS[MARKET_COUNT] ?? String(MARKET_COUNT);
const MARKET_NAMES = Object.values(COUNTRIES)
  .map((c) => c.place)
  .join(", ")
  .replace(/, ([^,]*)$/, " and $1");

export default async function PremiumPage({ searchParams }: { searchParams?: { keep?: string; code?: string } }) {
  const user = await getCurrentUser();
  // The visitor's market (the existing country resolution, no new geo lookup):
  // US leads with the watches, everywhere else with Best Basket.
  const market = getCountry();
  // Live proof and the deals teaser: both loaders are the homepage's own caches,
  // read directly (never wrapped), once, and a failure just leaves their
  // sections out. A member sees neither.
  const currency = COUNTRIES[market].currency;
  const [stats, deals] = isPremium(user)
    ? [null, null]
    : await Promise.all([getHomeStats().catch(() => null), getCachedTopDeals(market).catch(() => null)]);
  const proof: PremiumProof | null = isPremium(user)
    ? null
    : {
        stores: stats?.liveStoresAll ?? null,
        listings: stats ? Object.values(stats.statsByCountry).reduce((n, m) => n + (m?.inStock ?? 0), 0) || null : null,
        dealsBelowMarket: deals?.savingsVsMarketTotal ?? 0,
        dealsGapCents: deals?.savingsVsMarketCents ?? 0,
        topDeal: deals?.savingsVsMarket?.[0] ?? null,
        currency,
      };
  const teaser = teaserDeals(deals?.savingsVsMarket);
  const pays = paysForItself(teaser, currency);
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
  // The hero's checkout button: the annual plan when there is one (the pricing
  // section's own default), its price quoted under it; monthly is one tap away.
  const heroPlan: "monthly" | "annual" = annualLive ? "annual" : "monthly";
  // US$, not "$": the deals beside it are in the visitor's own currency (A$, C$…).
  const heroPriceLabel = usd(heroPlan === "annual" ? annualCompact : introEligible && introOfferEnabled() ? introPriceLine("premium") : compactPrice);
  const heroEffective = usd(premiumEffectiveMonthly());
  // "Free" is said only where checkout would really start a free trial.
  const freeTrialShown = !already && trialAvailable && PREMIUM_TRIAL_DAYS > 0 && PREMIUM_TRIAL_FEE_CENTS === 0;

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
      <div className="google-anno-skip">
      <div id="premium-hero" className="text-center">
        {!already && (
          <span className="chip mb-2 inline-flex bg-gold/15 text-[11px] font-extrabold uppercase tracking-widest text-gold">
            ✦ RiftCompare Premium
          </span>
        )}
        <h1 className="mx-auto max-w-3xl font-display text-3xl font-extrabold leading-tight text-white sm:text-5xl">
          {already ? `You're ${TIER_NAMES[currentTier ?? "premium"]}` : `${PREMIUM_HERO_HEADLINE}.`}
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-snug text-slate-300 sm:mt-3 sm:text-lg">
          {already ? "Thanks for supporting RiftCompare." : plusLive ? premiumHeroLine(market, plusLive) : PREMIUM_HERO_SUBLINE}
        </p>
        {proof && <PremiumProofStrip proof={proof} />}
        {!already && (
          <CtaZone location="hero" className="mx-auto mt-5 max-w-sm">
            <PremiumCta
              compact
              checkoutLive={checkoutLive}
              signedIn={!!user}
              trialEligible={trialEligible}
              trialAvailable={trialAvailable}
              priceLabel={heroPriceLabel}
              trialDays={PREMIUM_TRIAL_DAYS}
              trialFeeCents={PREMIUM_TRIAL_FEE_CENTS}
              plan={heroPlan}
              tier="premium"
            />
            {freeTrialShown && (
              <p className="mt-2 text-sm font-bold text-up" data-premium-trial-hero>
                Card required. We email you before you&apos;re charged. Cancel in two clicks.
              </p>
            )}
            <p className="mt-1.5 text-xs text-slate-400">
              {heroPlan === "annual" ? (
                <>
                  {freeTrialShown ? "Then " : ""}
                  {heroPriceLabel} ({heroEffective}/mo, save {annualSavingPct()}%) ·{" "}
                </>
              ) : null}
              <a href="#top-pricing" className="font-semibold text-slate-300 underline-offset-2 hover:underline" data-no-cta-track>
                {heroPlan === "annual" ? `or ${usd(PREMIUM_PRICE_AMOUNT)}/mo monthly` : "See the plan"}
              </a>
            </p>
          </CtaZone>
        )}
        {!already && (
          <CtaZone location="secondary" className="mx-auto mt-3 max-w-2xl space-y-1">
            <NoCardOptions signedIn={!!user} />
            <p className="text-xs text-slate-400" data-stores-crosslink>
              Run a store?{" "}
              <Link href="/stores" className="font-semibold text-slate-200 underline-offset-2 hover:underline">
                The Stores plan includes Premium
              </Link>{" "}
              ({STORE_PLAN_AMOUNT}/month).
            </p>
          </CtaZone>
        )}
      </div>

      {!already && (
        <>
          <PremiumPageView signedIn={!!user} />

          <PremiumDealsTeaser deals={teaser} total={deals?.savingsVsMarketTotal ?? 0} currency={currency} />

          <PremiumSavingsDemo exampleNames={teaser.map((d) => d.title)} />

          {/* "Pays for itself": only when today's average gap on the top deals
              is above a month of Premium (lib/premium-page.ts paysForItself). */}
          {pays && (
            <p className="mx-auto mt-6 max-w-xl rounded-xl border border-up/30 bg-up/10 px-4 py-3 text-center text-sm text-slate-200" data-premium-pays>
              Today&apos;s top {pays.dealCount} deals average <strong className="text-up">{formatMoney(pays.avgSavingCents, currency)}</strong> below market per card.
              One of them covers a month of Premium ({usd(PREMIUM_PRICE_AMOUNT)}
              {currency === "USD" ? "" : `, ≈ ${formatMoney(pays.monthlyInMarketCents, currency)}`}).
            </p>
          )}

          {/* /dashboard and MoversToolsCta link here. scroll-mt-header is the
              header-aware anchor offset (globals.css). */}
          <section id="top-pricing" aria-labelledby="premium-pricing" className="scroll-mt-header mt-10">
            <h2 id="premium-pricing" className="mb-3 text-center font-display text-xl font-extrabold text-white sm:text-2xl">
              {freeTrialShown ? `Start with ${PREMIUM_TRIAL_DAYS} days free` : "One plan, everything included"}
            </h2>
            <CtaZone location="pricing">
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
                afterCards={<ReassuranceStrip freeTrial={freeTrialShown} signedIn={!!user} />}
              />
            </CtaZone>
          </section>

          {/* Creator codes (2026-10-16): 20% off at checkout. */}
          <div className="mt-3">
            <CreatorCodeBox
              initial={creator ? { code: creator.code, name: creator.name, percentOff: creator.percentOff } : null}
              fromUrl={normaliseAffiliateCode(searchParams?.code)}
            />
          </div>

          <PremiumAlertPreview deal={teaser[0] ?? null} currency={currency} />

          {/* Real proof only: member quotes from lib/content/premium-testimonials.ts,
              which is empty until a member gives permission. Empty → nothing. */}
          {PREMIUM_TESTIMONIALS.length > 0 && (
            <section aria-labelledby="premium-quotes" className="mx-auto mt-10 max-w-3xl" data-premium-testimonials>
              <h2 id="premium-quotes" className="text-center font-display text-xl font-extrabold text-white sm:text-2xl">
                From Premium members
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {PREMIUM_TESTIMONIALS.map((t) => (
                  <figure key={t.quote} className="card-surface rounded-2xl border border-ink-700 p-4">
                    <blockquote className="text-sm leading-relaxed text-slate-200">&ldquo;{t.quote}&rdquo;</blockquote>
                    <figcaption className="mt-2 text-xs font-semibold text-slate-400">
                      {t.name}
                      {t.detail ? ` · ${t.detail}` : ""}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}

          <p className="mx-auto mt-8 max-w-xl text-center text-sm font-semibold text-slate-300" data-premium-markets>
            Premium works across {MARKET_COUNT_WORD} markets ({MARKET_NAMES}) and eBay.
          </p>

          <PremiumStickyCta
            label={freeTrialShown ? trialButtonLabel(PREMIUM_TRIAL_DAYS, PREMIUM_TRIAL_FEE_CENTS) : "Get Premium"}
            terms={
              freeTrialShown
                ? `Card required · then ${heroPriceLabel}${heroPlan === "annual" ? ` (${heroEffective}/mo)` : ""} · cancel in two clicks`
                : `${heroPriceLabel}${heroPlan === "annual" ? ` (${heroEffective}/mo)` : ""} · cancel anytime`
            }
            heroId="premium-hero"
            pricingId="top-pricing"
          />
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
              {/* A grandfathered Plus member: Premium access, Plus price. */}
              {subDetails.tier === "plus" && currentTier === "premium" && (
                <p className="text-xs text-slate-400" data-plus-grandfathered>
                  You keep your original Plus price, with everything in Premium included.
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
        <section className="mx-auto mt-8 max-w-3xl" aria-label="What Premium adds">
          <PremiumTicks showPlus prices={{ plus: `${tierMonthlyAmount("plus")}/mo`, premium: `${PREMIUM_PRICE_AMOUNT}/mo` }} you="plus" selected="premium" />
        </section>
      )}

      {/* FAQ — rendered visibly (not just as JSON-LD above) so Google honours
          the FAQPage markup. p-3 sits on the <summary>, so the whole card is the
          toggle (2026-09-23). */}
      <section id="faq" className="scroll-mt-header mt-10" aria-labelledby="premium-faq">
        <h2 id="premium-faq" className="mb-3 text-center text-lg font-extrabold text-white">Questions</h2>
        <PremiumFaqList items={FAQ} />
      </section>

      {/* Footer note */}
      <p className="mx-auto mt-6 max-w-xl text-center text-xs leading-relaxed text-slate-500">
        {already ? (
          <>Update your card or cancel anytime via &ldquo;Manage subscription&rdquo; above. </>
        ) : null}
        <Link href="/blog/riftcompare-premium-explained" className="text-slate-400 hover:underline">Every feature, explained</Link>
        {" · "}
        <Link href="/contact" className="text-slate-400 hover:underline">Get in touch</Link>
      </p>
      </div>
    </div>
  );
}

// The reassurance strip under the plan card: the trial, the reminder email, the
// way out (linking to the cancel answer) and who takes the payment. Each claim
// is shown only while it is true for this viewer.
function ReassuranceStrip({ freeTrial, signedIn }: { freeTrial: boolean; signedIn: boolean }) {
  const items: React.ReactNode[] = [
    freeTrial ? `${PREMIUM_TRIAL_DAYS} days free` : null,
    freeTrial ? "We email you before you're charged" : null,
    <a key="cancel" href="#faq-cancel" className="underline-offset-2 hover:underline" data-no-cta-track>
      Cancel in two clicks
    </a>,
    "Secure payment by Stripe",
    "Prices in US dollars",
    signedIn ? null : "No account needed to start",
  ].filter(Boolean);
  return (
    <ul className="mx-auto mt-3 flex max-w-2xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-300 sm:text-xs" data-premium-reassurance>
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-1">
          <span aria-hidden className="text-up">✓</span>
          {it}
        </li>
      ))}
    </ul>
  );
}

// NOT READY TO ADD A CARD? (2026-10-22, owner): the two no-card ways to Premium
// that already exist (lib/premium.ts FEEDBACK_PREMIUM_DAYS, REFERRAL_PREMIUM_DAYS),
// one low-key line right under the plan cards (PremiumPricingCards' afterCards).
function NoCardOptions({ signedIn }: { signedIn: boolean }) {
  if (!(FEEDBACK_PREMIUM_DAYS > 0 || REFERRAL_PREMIUM_DAYS > 0)) return null;
  return (
            <p className="mx-auto mt-2 max-w-2xl text-center text-xs text-slate-400" data-no-card-options>
              Not ready to add a card?{" "}
              {FEEDBACK_PREMIUM_DAYS > 0 && (
                <>
                  <Link href="/feedback" className="font-semibold text-slate-200 underline-offset-2 hover:underline">
                    Send us feedback
                  </Link>{" "}
                  for {FEEDBACK_PREMIUM_DAYS === 7 ? "a free week" : `${FEEDBACK_PREMIUM_DAYS} free days`} of Premium
                </>
              )}
              {FEEDBACK_PREMIUM_DAYS > 0 && REFERRAL_PREMIUM_DAYS > 0 ? ", or " : ""}
              {REFERRAL_PREMIUM_DAYS > 0 && (
                <>
                  share{" "}
                  <Link
                    href={signedIn ? "/profile" : "/login?next=%2Fprofile"}
                    rel={signedIn ? undefined : "nofollow"}
                    className="font-semibold text-slate-200 underline-offset-2 hover:underline"
                  >
                    your referral link
                  </Link>{" "}
                  for {REFERRAL_PREMIUM_DAYS} days of Premium per friend who signs up
                </>
              )}
              .
            </p>
  );
}
