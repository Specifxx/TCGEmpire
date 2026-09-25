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
  introOfferEnabled,
  introPriceLine,
  introAmountOffCents,
  tierIntroMonthlyAmount,
  INTRO_MONTHS,
  type PremiumTierKey,
} from "@/lib/site";
import { PLUS_TARGET_ALERT_LIMIT } from "@/lib/alert-limits";
import { pageAlternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { faqPage, ldJson } from "@/lib/jsonld";
import { PremiumRecoveryBeacon } from "@/components/PremiumRecoveryBeacon";
import { PremiumProofLine } from "@/components/PremiumProofLine";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "RiftCompare Premium — never overpay for a Riftbound card",
  description: "RiftCompare Plus and Premium: no ads, every card below TCGplayer market, target-price alerts that name the store, Best Basket — the cheapest delivered order for a whole list across your country's stores, skipping cards you already own — and Demand Finder, the cards players are searching for most. Price comparison is free for everyone, and a free account adds alerts and your portfolio.",
  alternates: pageAlternates("/premium"),
};

// Detailed feature cards — THE 2026-09-25 LINEUP, and only it: every card is a
// row of TIER_COMPARISON in buyer's words. `tier` names the CHEAPEST tier that
// actually includes it — "plus" for ad-free, target alerts and the full lists
// (also in Premium), "premium" for the list tools. Shown as a small caption
// only once Plus is actually live (see the render below); with Plus dark every
// card reads as Premium's, same as before the split.
const FEATURES: { title: string; body: string; href: string | null; cta: string | null; tier: PremiumTierKey }[] = [
  {
    title: "No ads, anywhere",
    body: "Plus and Premium remove every ad on every page, on the website and in the app, from the moment you subscribe. Automatic, nothing to switch on.",
    href: null,
    cta: null,
    tier: "plus",
  },
  {
    title: "Target-price alerts",
    body: `Tell us what you'd pay for a card on your watchlist. After every price update we check every tracked store in your country, and when it's there we email you the store and a link to the listing. Up to ${PLUS_TARGET_ALERT_LIMIT} cards on Plus, unlimited on Premium. Free accounts keep the weekly new-low email.`,
    href: "/watching",
    cta: "Open your watchlist",
    tier: "plus",
  },
  {
    title: "Deal Finder",
    body: "Every card cheaper than TCGplayer's market price at a real store, with a store filter, an eBay-only view and sorting. Narrow it to only the cards on your watchlist or in your binder to see which of yours are cheap right now. Free accounts see the top three.",
    href: "/tools/deal-finder",
    cta: "Open Deal Finder",
    tier: "plus",
  },
  {
    title: "Rising Cards",
    body: "Cards with high or rising search demand and few stores in stock, ranked with the reason for each pick — and, once a card has enough weekly prices, where its price sits in its own recent range. A screen, not a prediction, and not financial advice. Free accounts see the top three.",
    href: "/tools/rising",
    cta: "Open Rising Cards",
    tier: "plus",
  },
  {
    title: "Best Basket and Buy this list",
    body: "Send a decklist or your watchlist, tick “skip copies I already own”, and get the cheapest delivered order across your country's stores, with postage and free-shipping thresholds counted, shown beside the best one-store and two-store orders — or send your binder to see what replacing it would cost. Every signed-in account sees its own total first; Premium shows which store to buy each card from.",
    href: "/tools/best-basket",
    cta: "Open Best Basket",
    tier: "premium",
  },
  {
    title: "Your binder's replacement plan",
    body: "Your portfolio's delivered replacement cost is free for every account. Premium adds the store-by-store plan behind it: which store to buy each card from to replace the lot, postage included.",
    href: "/portfolio",
    cta: "Open your portfolio",
    tier: "premium",
  },
  {
    title: "Demand Finder",
    body: "The cards players are searching for and opening most on RiftCompare, over the last 7 or 30 days: the top 25 by searches and the top 25 by card views, with both counts and your market's price for every card. What players are looking at, not a forecast. Everyone gets the top 10 most searched this week free.",
    href: "/tools/demand",
    cta: "Open Demand Finder",
    tier: "premium",
  },
];


// The Product JSON-LD's per-tier descriptions: each names only what that tier
// really gets (TIER_COMPARISON's rows), so a rich result can't credit Plus
// with Premium's list tools or leave its ad-free benefit out.
const PLUS_OFFER_DESCRIPTION = `Plus: no ads on any page, target-price alerts on up to ${PLUS_TARGET_ALERT_LIMIT} watched cards, and the full Deal Finder and Rising Cards lists.`;
const PREMIUM_OFFER_DESCRIPTION =
  "Premium: everything in Plus, plus Best Basket's store-by-store plan for the cheapest delivered order, Buy this list for a deck, watchlist or binder, Demand Finder's most searched and most viewed cards, and unlimited target-price alerts.";
const PREMIUM_STANDALONE_DESCRIPTION =
  "No ads on any page, target-price alerts, the full Deal Finder and Rising Cards lists, Best Basket's store-by-store plan, Buy this list and Demand Finder.";

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
    a: `Price comparison, the card database, the deck and list pricer, trade calculator and box EV are free for everyone. A free account adds a watchlist with weekly new-low emails, your portfolio (including its delivered replacement cost), the top three of Deal Finder and Rising Cards, and your own Best Basket total; everyone sees the top 10 most searched cards of the week. ${
      premiumPlusEnabled()
        ? `Plus (${tierMonthlyAmount("plus")}/mo) removes every ad and adds target-price alerts on up to ${PLUS_TARGET_ALERT_LIMIT} cards, the full Deal Finder (filterable to only your cards) and the full Rising Cards list. Premium (${tierMonthlyAmount("premium")}/mo) adds Best Basket's store-by-store plan, Buy this list for your deck, watchlist or binder, unlimited target alerts, the plan behind your replacement cost, and Demand Finder's full most-searched and most-viewed lists.`
        : `Premium (${tierMonthlyAmount("premium")}/mo) removes every ad and adds target-price alerts, the full Deal Finder and Rising Cards lists, Best Basket's store-by-store plan, Buy this list and Demand Finder.`
    }`,
  },
  ...(premiumTrialEnabled()
    ? [
        {
          q: `How does the ${PREMIUM_TRIAL_DAYS}-day free trial work?`,
          a: `Start the trial and everything in the plan you picked unlocks immediately. A card is required to start, and nothing is charged until the trial ends — ${PREMIUM_TRIAL_DAYS} days later you're billed ${
            introOfferEnabled()
              ? `${premiumPlusEnabled() ? `${introPriceLine("plus")} for Plus or ` : ""}${introPriceLine("premium")}${premiumPlusEnabled() ? " for Premium" : ""} on the monthly plan`
              : `${premiumPlusEnabled() ? `${tierMonthlyAmount("plus")}/${PREMIUM_PRICE_PERIOD} for Plus or ` : ""}${PREMIUM_PRICE_AMOUNT}/${PREMIUM_PRICE_PERIOD}${premiumPlusEnabled() ? " for Premium" : ""}`
          } (or the annual rate, if you chose that plan) unless you cancel first. Cancel during the trial and you are never charged. We email you a day or two before the first charge.`,
        },
      ]
    : []),
  ...(introOfferEnabled()
    ? [
        {
          q: `What is the half-price offer?`,
          a: `New subscribers on a monthly plan pay half price for their first ${INTRO_MONTHS} months — ${tierIntroMonthlyAmount("premium")}/mo for Premium${premiumPlusEnabled() ? ` or ${tierIntroMonthlyAmount("plus")}/mo for Plus` : ""} — after the free trial, then the normal monthly price. It is applied automatically at checkout; there is no code to enter. Annual plans are already the cheapest way to pay for a year, so they keep their normal price.`,
        },
      ]
    : []),
  {
    q: "What happens when the trial ends?",
    a: `If you haven't cancelled, the card on file is charged and your subscription continues automatically at whichever plan you chose — ${introFromLine()}${introOfferEnabled() ? " (the half-price months are for new subscribers)" : ""}. We email you a day or two before it converts.`,
  },
  {
    q: "How do I cancel?",
    a: "From this page, use \"Manage subscription\" to open Stripe's billing portal and cancel in a couple of clicks — no email or phone call needed. You keep access until the end of the period you already paid for (or, during a trial, until it ends — and a trial cancelled before it ends is never charged).",
  },
  {
    q: "Is Plus really ad-free?",
    a: `Yes. Plus and Premium both remove every ad on every page, on the website and in the app, from the moment you subscribe — the free trial included. It is the first thing Plus does${premiumPlusEnabled() ? `, and at ${tierMonthlyAmount("plus")}/mo it is the cheapest way to browse RiftCompare without ads` : ""}.`,
  },
  {
    q: "Does my price ever go up?",
    a: premiumLockInLine(),
  },
  {
    q: "Monthly or annual — what's the difference?",
    a: `Same features either way. Monthly is ${premiumPlusEnabled() ? `${tierMonthlyAmount("plus")}/${PREMIUM_PRICE_PERIOD} for Plus or ` : ""}${PREMIUM_PRICE_AMOUNT}/${PREMIUM_PRICE_PERIOD}${premiumPlusEnabled() ? " for Premium" : ""} with no commitment; annual is ${premiumPlusEnabled() ? `${tierAnnualAmount("plus")}/yr or ` : ""}${PREMIUM_ANNUAL_AMOUNT}/yr, billed once a year, which works out cheaper per month. Switch from monthly to annual anytime from your account once your first payment has gone through.`,
  },
  {
    q: "Which plan is worth it?",
    a: "Depends entirely on how you buy. Plus is for someone who buys singles regularly: it takes the ads away, shows every card below TCGplayer market, and emails you the store when a card you watch reaches the price you set. Premium is for buying a whole deck or list: Best Basket shows the cheapest delivered order next to the best single-store order, so the saving on your own list is a number you can check (every signed-in account sees its own total before paying) rather than a claim we make. Premium also opens Demand Finder, the full list of cards players are searching for and opening. If you only buy the occasional single card, the free account is genuinely all you need — that's deliberate.",
  },
  ...(premiumPlusEnabled()
    ? [
        {
          q: "Can I upgrade from Plus to Premium later?",
          a: "Yes — one click from this page once your first payment has gone through (plan changes aren't available during the free trial). You're only charged the prorated difference for the rest of your current billing period, on the same monthly or annual cycle, and Best Basket's store-by-store plan, Buy this list and Demand Finder unlock immediately.",
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

      {/* Header. Subhead dropped the "$0 today" framing 2026-09-11 — see
          DECISIONS.md — in favour of a plain statement of what Premium is
          for, closer to how mtgstocks.com/go-premium frames its own hero
          ("[the site] is a labor of love..."). The real trial length is
          still named, just no longer built around a "$0" headline number. */}
      <div className="text-center">
        <span className="chip mb-3 inline-flex bg-gold/15 font-bold uppercase tracking-wide text-gold">Premium</span>
        <h1 className="font-display text-3xl font-extrabold text-white sm:text-4xl">
          {already ? `You're ${TIER_NAMES[currentTier ?? "premium"]}` : "Never overpay for a Riftbound card"}
        </h1>
        {/* The 2026-09-25 subline: one sentence per tier, what each is FOR.
            The trial clause reads trialAvailable (this viewer can really
            start one), not premiumTrialEnabled(): a returning trialist was
            being promised a second trial here that checkout won't give. */}
        {!already && (
          <p className="mx-auto mt-3 max-w-xl text-base font-semibold leading-relaxed text-slate-200">
            {plusLive
              ? "Plus watches your cards and shows every deal. Premium buys your whole list for less, and shows what players are hunting for."
              : "Premium watches your cards, shows every deal, buys your whole list for less and shows what players are hunting for."}
          </p>
        )}
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
          {already
            ? "Everything you've unlocked is below — jump straight into any of it. Thanks for supporting RiftCompare."
            : `Price comparison stays free for everyone, and ${plusLive ? "both paid plans are" : "Premium is"} ad-free. ${plusLive ? "Plus and Premium fund" : "Premium funds"} the servers and the price data behind the site${
                trialAvailable ? ` — every plan starts with a ${PREMIUM_TRIAL_DAYS}-day free trial` : ""
              }${introEligible ? `, and monthly plans are half price for the first ${INTRO_MONTHS} months` : ""}.`}
        </p>
      </div>

      {/* Pricing */}
      {/* THE LOCK-IN BANNER BELOW RENDERS IN BOTH STATES as of 2026-09-22
          (owner: "we need to emphasis get premium now before the price
          increases as the site grows"). It used to be gated on
          premiumPriceIncreaseAnnounced(), so with no specific increase
          announced — the state this site has been in since 2026-09-09 — the
          entire reason to act today shrank to one 11px grey caption below the
          pricing cards, which is where copy goes to be unread. The lock-in
          guarantee is true whether or not a rise is scheduled (see
          premiumLockInHeadline's comment for why every word of it is literally
          what the billing code does), and it is the strongest honest argument
          this page has. Announcing a real increase still upgrades the wording
          automatically via one env var — no code change.

          It stays inside the `!already` gate: someone who is already Premium
          is grandfathered, so "lock in before it rises" has nothing to say to
          them and reads as a threat to the rate they already hold. */}
      {!already && (
        <>
          <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-gold/40 bg-gold/10 px-5 py-3 text-center">
            <p className="text-sm font-bold text-gold">{premiumLockInHeadline()}</p>
            {premiumPriceIncreaseAnnounced() ? (
              <p className="mt-1 text-xs text-gold/80 [[data-theme=light]_&]:text-gold">
                New subscribers will pay {PREMIUM_NEXT_PRICE_AMOUNT}/{PREMIUM_PRICE_PERIOD} once the change takes
                effect. Subscribe today and keep {PREMIUM_PRICE_AMOUNT}/{PREMIUM_PRICE_PERIOD} for as long as your
                subscription stays active — no action needed later.
              </p>
            ) : (
              <p className="mt-1 text-xs text-gold/80 [[data-theme=light]_&]:text-gold">{premiumLockInLine()}</p>
            )}
          </div>

          {/* Client island, renders nothing until it resolves — see its own comment. */}
          <PremiumProofLine />

          {/* /dashboard and MoversToolsCta link here. scroll-mt-header is the
              header-aware anchor offset (globals.css): scroll-mt-20 landed the
              cards at 104px, under the 125px two-row header on phones. */}
          <div id="top-pricing" className="scroll-mt-header">
          <PremiumPricingCards
            plusLive={plusLive}
            plusAnnualLive={plusAnnualLive}
            annualLive={annualLive}
            checkoutLive={checkoutLive}
            signedIn={!!user}
            trialEligible={trialEligible}
            trialAvailable={trialAvailable}
            trialDays={PREMIUM_TRIAL_DAYS}
            introEligible={introEligible}
          />
          </div>

          <p className="mx-auto mt-4 max-w-2xl text-center text-[11px] text-slate-500">
            Cancel anytime · secure checkout by Stripe
          </p>
          <p className="mx-auto mt-1 max-w-2xl text-center text-[11px] font-medium text-gold/80 [[data-theme=light]_&]:text-gold">{premiumLockInLine()}</p>
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
                  ? "Free trial"
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
                    <>Trial ends {fmtDate(subDetails.currentPeriodEnd)} — you won&apos;t be charged</>
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
          {checkoutLive && <ManageSubscriptionButton />}
        </div>
      )}

      {/* Feature comparison */}
      <div className="mt-10">
        <h2 className="mb-1 text-center text-lg font-extrabold text-white">Feature comparison</h2>
        <p className="mb-3 text-center text-xs text-slate-500">
          {plusLive
            ? "See exactly what you get with each tier — Plus goes ad-free and unlocks the full lists; Premium adds the list tools and Demand Finder on top."
            : "See exactly what you get with each tier — Premium goes ad-free and adds the full lists, the list tools and Demand Finder."}
        </p>
        <div className="card-surface p-1">
          <TierComparisonTable showPlus={plusLive} tinted />
        </div>
        {!user && (
          <p className="mt-3 text-center text-xs text-slate-400">
            <Link href="/login?next=/premium" className="text-brand-400 hover:underline">
              Create a free account
            </Link>{" "}
            to unlock the Free account column — no card required.
          </p>
        )}
      </div>

      {/* What's included — a closer look at each feature. */}
      <div className="mt-10">
        <h2 className="mb-1 text-center text-lg font-extrabold text-gold">What&apos;s included</h2>
        <p className="mb-4 text-center text-xs text-slate-500">A closer look at each Plus and Premium feature.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className={`card-surface flex flex-col border-l-2 p-4 sm:odd:last:col-span-2 ${f.tier === "plus" && plusLive ? "border-slate-400/40" : "border-gold/40"}`}>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white">{f.title}</h3>
                {plusLive && (
                  <span className={`chip text-[9px] font-semibold ${f.tier === "plus" ? "bg-slate-500/15 text-slate-300" : "bg-gold/15 text-gold"}`}>
                    {f.tier === "plus" ? "Plus & Premium" : "Premium"}
                  </span>
                )}
              </div>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{f.body}</p>
              {/* The "open it" link only appears for a member who can actually
                  open it — a Plus member's own membership page must not hand
                  them a button into a Premium upsell wall. */}
              {already && f.href && (currentTier !== "plus" || f.tier === "plus") && (
                <Link href={f.href} className="btn-ghost mt-3 self-start text-sm">{f.cta} →</Link>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* FAQ — objection handling this page had none of, despite carrying the
          checkout decision. Rendered visibly (not just as JSON-LD above) so
          Google honours the FAQPage markup and so it actually answers a
          reader's question rather than only feeding a rich result. mtgstocks'
          own page has no FAQ pillar to borrow the position from — kept last,
          as a closing objection-handling section rather than dropped. */}
      <div className="mt-10">
        <h2 className="mb-3 text-center text-lg font-extrabold text-white">Frequently asked questions</h2>
        <div className="mx-auto max-w-2xl space-y-3">
          {/* p-4 sits on the <summary>, not the <details>, so the whole card is
              the toggle: a tap in the padding band used to hit the details box
              and do nothing (2026-09-23). The native marker stays. */}
          {FAQ.map((f) => (
            <details key={f.q} className="card-surface rounded-xl border border-ink-700">
              <summary className="cursor-pointer p-4 text-sm font-semibold text-white">{f.q}</summary>
              <p className="px-4 pb-4 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
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
            {" "}after {PREMIUM_TRIAL_DAYS} day{PREMIUM_TRIAL_DAYS === 1 ? "" : "s"} unless you cancel first
            {introEligible ? <> — at half price for the first {INTRO_MONTHS} months on a monthly plan</> : null}. We email
            you a day or two before you&apos;re charged.{" "}
          </>
        ) : (
          <>Cancel anytime — your benefits run to the end of the paid period. </>
        )}
        <Link href="/contact" className="text-slate-400 hover:underline">Questions? Get in touch</Link>.
      </p>
    </div>
  );
}
