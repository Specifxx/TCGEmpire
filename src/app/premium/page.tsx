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
import { renewalReminderAhead } from "@/lib/renewal-reminders";
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
import { pageAlternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { faqPage, ldJson } from "@/lib/jsonld";
import { PremiumRecoveryBeacon } from "@/components/PremiumRecoveryBeacon";
import { PremiumProofLine } from "@/components/PremiumProofLine";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "RiftCompare Premium — never overpay for a Riftbound card",
  description: "RiftCompare Premium finds the cheapest way to buy what you actually want: Best Basket splits a whole decklist across stores with postage included, the Bulk Pricer costs a want-list in one paste, and the full Deal Finder and Value Finder lists show where a card is going cheap. Price comparison is free for everyone, and a free account adds alerts and your portfolio.",
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
    body: "Every card trading below its own 30-day average right now, ranked by discount — so you can tell at a glance whether a card you want is cheap by its own standards or just cheap-looking.",
    href: "/tools/value-finder",
    cta: "Open Value Finder",
    tier: "premium",
  },
  {
    title: "Rising Cards",
    body: "Cards ranked by demand and price-timing signals, so you know whether the one on your want-list is better bought now than left for later. Transparent scoring, backtested, and not financial advice. Free accounts see the top three; Premium shows every pick.",
    href: "/tools/rising",
    cta: "Open Rising Cards",
    tier: "plus",
  },
  {
    title: "Rising Sealed",
    body: "Booster boxes, packs and bundles ranked by price-timing and supply signals — near their own recent low, thin in-stock, not already spiking. Useful for timing a box you were going to open anyway; not financial advice. Free shows only the top pick.",
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
    body: "The full list of cards eBay is cheapest to buy, and cards priced meaningfully cheaper in another tracked market — plus, if you're selling, the cards worth more on eBay than in stores. All sources, sortable, updated daily. Free accounts see the top three; Premium shows every deal.",
    href: "/tools/deal-finder",
    cta: "Open Deal Finder",
    tier: "plus",
  },
  {
    title: "Ad-free everywhere",
    body: "No ads on any page while you're on Plus or Premium — automatic, nothing to switch on.",
    href: null,
    cta: null,
    tier: "plus",
  },
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
    a: `Price comparison, the deck builder, trade calculator, box EV and a free account's alerts, watchlist and portfolio are free for everyone. ${premiumPlusEnabled() ? `Plus (${tierMonthlyAmount("plus")}/mo) adds an ad-free site and the full Deal Finder, Rising Cards and Rising Sealed lists; Premium adds the four pro tools on top — Bulk Pricer, Best Basket, Value Finder and Demand Finder.` : "Premium adds the Bulk Pricer, Best Basket optimiser, Value Finder screener, Rising Cards, Rising Sealed, Demand Finder, the full Deal Finder list and an ad-free site."}`,
  },
  {
    q: `How does the ${PREMIUM_TRIAL_DAYS}-day free trial work?`,
    a: `Start the trial and every Premium tool unlocks immediately. A card is required to start, and nothing is charged until the trial ends — ${PREMIUM_TRIAL_DAYS} days later you're billed ${introOfferEnabled() ? `${introPriceLine()} on the monthly plan` : `${PREMIUM_PRICE_AMOUNT}/${PREMIUM_PRICE_PERIOD}`} (or the annual rate, if you chose that plan) unless you cancel first. We email you a day or two before the first charge.`,
  },
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
    a: "From this page: \"Turn off auto-renew\" on your subscription card is one click, or use \"Manage subscription\" to open Stripe's billing portal — no email or phone call needed. You keep access until the end of the period you already paid for (or, during a trial, until it ends).",
  },
  // Customer feedback, 2026-09-25: "Personally I hate auto renewal so I
  // disable it for everything and then renew when needed." Answered here and
  // on the account card only — deliberately not in the hero, the pricing
  // cards or checkout. Every clause is what the code does: api/premium/
  // auto-renew, the reminder runs (24–48h ahead), resume's intro rule.
  {
    q: "Can I turn off auto-renew?",
    a: `Yes. Once you're subscribed, "Turn off auto-renew" on this page is one click. You keep everything until the end of your trial or the period you've paid for, and nothing more is charged. Switch it off more than two days before the end and we email you a day or two before it ends, with a link to renew in one click — renewing turns auto-renew back on and charges nothing until that date.${
      introOfferEnabled()
        ? " Renewing before it ends keeps any half-price months you have left; once it has ended, a new subscription is the full price for anyone who has already paid."
        : ""
    }`,
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
    a: "Depends entirely on how much you buy. Best Basket is the honest test: it shows the unoptimised total next to its own, so the saving on a single deck order is a number you can check rather than a claim we make. On a full deck that difference is often more than a month of Premium. See the live numbers above for what Deal Finder is showing right now. If you only buy the occasional single card, the free tier is genuinely all you need — that's deliberate.",
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
  // A renewing subscription gets "Turn off auto-renew" (api/premium/auto-renew)
  // — trial or paid, never past_due (that period is unpaid, so "you keep
  // everything until" would not be true). The reminder is promised only when
  // it will really still go out (renewalReminderAhead).
  const autoRenew =
    subDetails && !subDetails.cancelAtPeriodEnd && (subDetails.status === "active" || subDetails.status === "trialing")
      ? {
          until: fmtDate(subDetails.currentPeriodEnd),
          reminder: renewalReminderAhead(subDetails.currentPeriodEnd, user?.premiumUntil),
        }
      : null;
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
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
          {already
            ? "Everything you've unlocked is below — jump straight into any of it. Thanks for supporting RiftCompare."
            : `RiftCompare is free to search and free to use. ${plusLive ? "Plus and Premium fund" : "Premium funds"} the servers and the price data behind it. ${plusLive ? "Plus goes ad-free and unlocks the full deal lists; Premium adds" : "Premium adds ad-free browsing and"} the tools that work out the cheapest way to buy what you want${
                premiumTrialEnabled() ? ` — every plan starts with a ${PREMIUM_TRIAL_DAYS}-day free trial` : ""
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
                canManageBilling={checkoutLive}
                trialing={subDetails.status === "trialing"}
                keep={keepOffer}
                highlightKeep={searchParams?.keep === "1"}
                autoRenew={autoRenew}
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

      {/* Member quick links — only what this member can actually open. The four
          pro tools are dropped for a Plus member rather than left to bounce them
          into an upsell wall from their own membership page; the upgrade path is
          the SubscriptionActions card above, which states the price. */}
      {already && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
          <Link href="/dashboard" className="btn-primary">◆ Your dashboard</Link>
          {currentTier !== "plus" && (
            <>
              <Link href="/bulk-pricer" className="btn-ghost">Bulk Pricer</Link>
              <Link href="/tools/best-basket" className="btn-ghost">Best Basket</Link>
              <Link href="/tools/value-finder" className="btn-ghost">Value Finder</Link>
              <Link href="/tools/demand" className="btn-ghost">Demand Finder</Link>
            </>
          )}
          <Link href="/tools/rising" className="btn-ghost">Rising Cards</Link>
          <Link href="/tools/rising-sealed" className="btn-ghost">Rising Sealed</Link>
          <Link href="/tools/deal-finder" className="btn-ghost">Deal Finder</Link>
          <Link href="/tools/condition-calculator" className="btn-ghost">Condition Calculator</Link>
          <Link href="/portfolio" className="btn-ghost">Portfolio</Link>
          {checkoutLive && <ManageSubscriptionButton />}
        </div>
      )}

      {/* Feature comparison */}
      <div className="mt-10">
        <h2 className="mb-1 text-center text-lg font-extrabold text-white">Feature comparison</h2>
        <p className="mb-3 text-center text-xs text-slate-500">
          {plusLive
            ? "See exactly what you get with each tier — Plus adds the full lists, Premium adds no ads and the pro screeners on top."
            : "See exactly what you get with each tier — Premium adds the list-pricing tools and the pro screeners."}
        </p>
        <div className="card-surface p-1">
          <TierComparisonTable showPlus={plusLive} tinted />
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

      {/* What's included — a closer look at each feature. */}
      <div className="mt-10">
        <h2 className="mb-1 text-center text-lg font-extrabold text-gold">What&apos;s included</h2>
        <p className="mb-4 text-center text-xs text-slate-500">A closer look at each Plus and Premium feature.</p>
        <div className="grid gap-3 sm:grid-cols-2">
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
