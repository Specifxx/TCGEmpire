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
import { PremiumTicks } from "@/components/PremiumTicks";
import { cookies } from "next/headers";
import { CreatorCodeBox } from "@/components/CreatorCodeBox";
import { findActiveAffiliate } from "@/lib/creator-affiliate";
import { AFFILIATE_COOKIE, normaliseAffiliateCode } from "@/lib/creator-affiliate-code";
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

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "RiftCompare Premium — never overpay for a Riftbound card",
  description: "Compare Riftbound card prices across every store, free, and track what your binder is missing. Plus and Premium watch prices for you: your own target price on cards, sealed products back in stock or at RRP, and (Premium) a whole deck's delivered total re-priced after every update, the store-by-store plan for a deck or the rest of a set, at the condition you'll play. No ads on either.",
  alternates: pageAlternates("/premium"),
};

// The Product JSON-LD's per-tier descriptions: each names only what that tier
// really gets (TIER_COMPARISON's rows), so a rich result can't credit Plus
// with Premium's list tools or leave its ad-free benefit out.
const PLUS_OFFER_DESCRIPTION = `Plus: no ads on any page, an unlimited watchlist and portfolio (so a whole set fits in the set tracker), target-price alerts on up to ${PLUS_TARGET_ALERT_LIMIT} watched cards, sealed watches on up to ${SEALED_WATCH_LIMIT_PLUS} products (back in stock, at RRP in ${SEALED_RRP_MARKETS}, or at your price, checked ${SEALED_CHECK_CADENCE}), and the full Deal Finder and Rising Cards lists.`;
const PREMIUM_OFFER_DESCRIPTION = `Premium: everything in Plus, plus a deck price watch (up to ${DECK_WATCH_LIMIT} saved lists re-priced delivered after every price update, emailed at your price), unlimited target-price alerts and sealed watches, Best Basket's store-by-store plan for the cheapest delivered order (at the minimum condition you set), Buy this list for a deck, watchlist or binder, the store-by-store plan for what a set is missing, and Demand Finder's most searched and most viewed cards.`;
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
const FAQ: { q: string; a: string }[] = [
  {
    q: "What's free?",
    a: `Comparing prices is free for everyone, with no limit. A free account adds a watchlist (${FREE_WATCHLIST_LIMIT} cards), a portfolio (${FREE_PORTFOLIO_LIMIT}) and a set checklist.`,
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
    q: "What happens to cards I already track?",
    a: `You keep them all. The free limits (${FREE_WATCHLIST_LIMIT} watched cards, ${FREE_PORTFOLIO_LIMIT} portfolio cards) only stop you adding a NEW card, and nothing is deleted if a subscription ends. Only a new card needs ${premiumPlusEnabled() ? "Plus" : "Premium"}.`,
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

export default async function PremiumPage({ searchParams }: { searchParams?: { keep?: string; code?: string } }) {
  const user = await getCurrentUser();
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

      {/* 70% SIMPLER (2026-10-17, owner: "way too convoluted… a lot of double up
          on information… what's really useful is the comparison of the ticks and
          the crosses"). DECISIONS.md, "/premium, 70% simpler". For a visitor who
          has not bought, in this order: one line, one subline, the Monthly /
          Annual toggle, the two plan cards with their buy buttons, the ticks
          table (inside PremiumPricingCards, so the toggle drives its prices),
          the creator code, three short questions. The "What you get" list, the
          what-you're-missing grid with its captions and half marks, the proof
          line and the second copy of the fine print all went: the table says
          what each plan includes, once. A member sees their own tier and
          account card in this same spot instead of the cards. The hero says
          what is free before what is paid and quotes no price or saving figure.

          google-anno-skip keeps Google's ad-intent chips out of the sales copy
          (ad-free-boot.ts, AD_INTENTS_SKIP_CLASS). */}
      <div className="google-anno-skip">
      <div className="text-center">
        <h1 className="font-display text-2xl font-extrabold leading-tight text-white sm:text-4xl">
          {already ? `You're ${TIER_NAMES[currentTier ?? "premium"]}` : "Know what you're missing. Buy it for less."}
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-snug text-slate-300 sm:mt-3 sm:text-base">
          {already
            ? "Thanks for supporting RiftCompare."
            : plusLive
            ? "Comparing prices is free. Plus and Premium remove the ads and watch prices for you."
            : "Comparing prices is free. Premium removes the ads and watches prices for you."}
        </p>
      </div>

      {!already && (
        <>
          {/* /dashboard and MoversToolsCta link here. scroll-mt-header is the
              header-aware anchor offset (globals.css). */}
          <div id="top-pricing" className="scroll-mt-header mt-5 sm:mt-7">
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
            {user ? "Cancel anytime · secure checkout by Stripe" : "No account needed to start · sign in after paying · Cancel anytime · secure checkout by Stripe"}
          </p>

          {/* Creator codes (2026-10-16): 20% off at checkout. */}
          <div className="mt-3">
            <CreatorCodeBox
              initial={creator ? { code: creator.code, name: creator.name, percentOff: creator.percentOff } : null}
              fromUrl={normaliseAffiliateCode(searchParams?.code)}
            />
          </div>
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

      {/* A Plus member sees what Premium adds, as the same ticks. */}
      {already && currentTier === "plus" && (
        <section className="mx-auto mt-8 max-w-3xl" aria-label="What Premium adds">
          <PremiumTicks showPlus prices={{ plus: `${tierMonthlyAmount("plus")}/mo`, premium: `${PREMIUM_PRICE_AMOUNT}/mo` }} you="plus" selected="premium" />
        </section>
      )}

      {/* FAQ — rendered visibly (not just as JSON-LD above) so Google honours
          the FAQPage markup. p-3 sits on the <summary>, so the whole card is the
          toggle (2026-09-23). */}
      <section className="mt-8" aria-labelledby="premium-faq">
        <h2 id="premium-faq" className="mb-3 text-center text-lg font-extrabold text-white">Questions</h2>
        <div className="mx-auto max-w-2xl space-y-2">
          {FAQ.map((f) => (
            <details key={f.q} className="card-surface rounded-xl border border-ink-700">
              <summary className="cursor-pointer p-3 text-sm font-semibold text-white">{f.q}</summary>
              <p className="px-3 pb-3 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
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
