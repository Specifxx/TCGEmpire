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
import { DECK_WATCH_LIMIT, PLUS_TARGET_ALERT_LIMIT, SEALED_CHECK_CADENCE, SEALED_WATCH_HARD_CAP, SEALED_WATCH_LIMIT_PLUS } from "@/lib/alert-limits";
import { FREE_PORTFOLIO_LIMIT, FREE_WATCHLIST_LIMIT } from "@/lib/free-limits";
import { SET_GAP_CHUNK } from "@/lib/set-gap";
import { RADIANCE_RELEASE_DATE, isBeforeRadianceRelease } from "@/lib/sets/radiance";
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

// THE PERSONA SECTIONS (2026-09-29, DECISIONS.md, "Personas: the set tracker,
// Finish this set, minimum condition, six-hourly sealed watches"). Owner: "Picture
// a trading card player or collector: what would they pay for". Each section is one
// person doing a chore by hand, what is free for them FIRST, then what Plus and
// Premium add, and a link to the real page. Every number is the enforced constant.
// Nothing here predicts a price, names a saving, counts down or says "worth": the
// only saving figure on the site is Best Basket's own computed one on the
// viewer's own list, and it is not quoted here. A feature is described only when it
// is live (the set watch, planned for later, is deliberately absent).
type PersonaSection = { eyebrow: string; headline: string; body: string; features: string[]; href: string; cta: string };

const dayMonth = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

function personaSections(now: Date = new Date()): PersonaSection[] {
  const beforeRadiance = isBeforeRadianceRelease(now);
  const radianceDay = dayMonth(RADIANCE_RELEASE_DATE);
  return [
    {
      eyebrow: "If you collect",
      headline: "See what your set is missing, and what it costs to finish",
      body: `Tick what's in your binder and see how far through a set you are, what's missing, and the cheapest listing for each card in your country, before postage. That part is free for your first ${FREE_PORTFOLIO_LIMIT} cards. Plus removes the limit so a whole set fits (nobody loses cards they already have). Premium turns the missing list into an order: which stores to buy from, with postage measured, skipping what you own.`,
      features: [
        `Set progress and a missing list, cheapest first, free for up to ${FREE_PORTFOLIO_LIMIT} cards`,
        "Base set, or every printing we track (alt-arts, overnumbered prints, Signatures)",
        "Whole-set binder with no limit (Plus)",
        `Finish this set: a store-by-store plan for what's missing, up to ${SET_GAP_CHUNK} cards at a time (Premium)`,
      ],
      href: "/portfolio/sets",
      cta: "Start with a free set checklist",
    },
    {
      eyebrow: "If you play",
      headline: "The cheapest delivered way to finish the deck, in the condition you'll play",
      body: "Paste a list and Best Basket splits it across stores with the postage counted, and your own total is free. Premium lets you set the lowest condition you'll accept (Near Mint only, Lightly Played or better, or anything), so the plan never quietly includes a heavily played copy. The deck price watch emails you when the delivered total drops, using the same rule as the page, so the email and the page agree.",
      features: [
        "Store-by-store plan with measured postage",
        "Minimum condition, kept in the plan, Buy this list and the deck watch",
        "Skip copies you already own",
        `Deck price watch on up to ${DECK_WATCH_LIMIT} saved lists`,
      ],
      href: "/deck",
      cta: "Price your deck free, then see the plan",
    },
    {
      eyebrow: "If you buy sealed",
      headline: "Hear about the box while it's still on the shelf",
      body: `Heart a booster box, bundle or Proving Grounds set and Plus emails you when it's back in stock at a real store, at or under RRP where we publish one (Australia, the US and the UK today), or at your own target price. Stores are read ${SEALED_CHECK_CADENCE} and every email says when the store was last checked. It isn't instant, and a Discord stock bot may be faster; we'd rather say so. Real stores only, never eBay.`,
      features: [
        "Restock, at-RRP, target and drop alerts",
        `Checked ${SEALED_CHECK_CADENCE}, with the time in each email`,
        `Up to ${SEALED_WATCH_LIMIT_PLUS} products on Plus, unlimited on Premium`,
        "Pre-order price comparison stays free",
      ],
      href: "/sealed",
      cta: "Watch a box",
    },
    // The Radiance block is published because the set tracker is live (the plan's
    // condition). Date-aware: after release it says so instead of counting down.
    {
      eyebrow: "Radiance launch",
      headline: beforeRadiance ? `Radiance is ${radianceDay}. Bring a list, not six tabs.` : "Radiance is out. Tick what you pull, see what's left.",
      body: beforeRadiance
        ? `Pre-order prices for boxes are already side by side, free. Watch the cards you need (${FREE_WATCHLIST_LIMIT} free, unlimited on Plus) and get an email when a store first lists one or opens it for pre-order, labelled as such. Once the set is out, tick what you pull and see what's left; Premium plans the cheapest delivered order for the rest. We don't predict prices or tell you when to buy: we show what stores charge today and tell you when your number is met.`
        : `Tick what you pull and see what's left, with the cheapest listing for each missing card. The count says how many cards are revealed so far until the set is complete, because the printed total isn't settled. Premium plans the cheapest delivered order for the rest. We don't predict prices or tell you when to buy: we show what stores charge today.`,
      features: [
        "Radiance pre-order comparison, free",
        `Free watches on Radiance cards, up to ${FREE_WATCHLIST_LIMIT} (unlimited on Plus)`,
        "Set tracker from release, counting revealed cards only until the set is complete",
        "Finish this set plan (Premium)",
      ],
      href: beforeRadiance ? "/radiance-preorders" : "/sets/radiance",
      cta: beforeRadiance ? "Compare Radiance pre-orders" : "Open the Radiance set",
    },
  ];
}

// ONE SECTION PER PAID FEATURE (rewritten 2026-09-29, owner: "it also needs to
// be marketed better and highly accessible to new users"). Each is a row of
// TIER_COMPARISON in a newcomer's words: `body` is what it does, `when` is
// when you'd use it, `tier` the CHEAPEST tier that includes it ("plus" is
// also in Premium). Every number is the enforced constant, never typed. No
// jargon without its one-line meaning: "delivered" is the item price plus
// postage; RRP is the price Riot sets. Shown ABOVE the pricing cards, so the
// page can be scanned in 30 seconds: what's free, what each thing does, then
// what it costs. tests/tool-free-top3.test.ts reads the Deal Finder and
// Rising Cards entries by their href.
const FEATURES: { title: string; body: string; when: string; href: string | null; cta: string | null; tier: PremiumTierKey }[] = [
  {
    title: "Deck price watch",
    body: `Save a deck or card list and we re-price the whole thing after every price update — every card plus postage, across every store in your country — and email you when the delivered total is at or under the price you set, or drops for real. Up to ${DECK_WATCH_LIMIT} lists.`,
    when: "You want a whole deck but not at today's price. Set the price you'd pay once, and get on with your life.",
    href: "/tools/best-basket",
    cta: "Open Best Basket",
    tier: "premium",
  },
  {
    title: "Sealed watches",
    body: `Tap the heart on a booster box, bundle or Proving Grounds set and we email you when it is back in stock after selling out at every store we track, when a store has it at RRP (the price Riot sets), at your own price, or on a real drop. Sealed products are checked ${SEALED_CHECK_CADENCE} and every email says when the store was last read; a Discord stock bot may be faster. Up to ${SEALED_WATCH_LIMIT_PLUS} products on Plus, unlimited on Premium.`,
    when: "A box sold out at launch, or every listing is over RRP, and you'd rather be told than keep checking.",
    href: "/sealed",
    cta: "Open sealed products",
    tier: "plus",
  },
  {
    title: "Target-price alerts",
    body: `Tell us what you'd pay for a card on your watchlist. After every price update we check every tracked store in your country, and when it's there we email you the store and a link to the listing. Up to ${PLUS_TARGET_ALERT_LIMIT} cards on Plus, unlimited on Premium. Free accounts keep the weekly new-low email.`,
    when: "You know what a card is worth to you and don't want to check every day.",
    href: "/watching",
    cta: "Open your watchlist",
    tier: "plus",
  },
  {
    title: "Deal Finder — only my cards",
    body: "Every card cheaper than TCGplayer's market price at a real store, with a store filter, an eBay-only view and sorting. Narrow it to only the cards on your watchlist or in your binder to see which of yours are cheap right now. Free accounts see the top three.",
    when: "Before you buy, to see whether anything you already want is cheap today.",
    href: "/tools/deal-finder",
    cta: "Open Deal Finder",
    tier: "plus",
  },
  {
    title: "Rising Cards",
    body: "Cards with high or rising search demand and few stores in stock, ranked with the reason for each pick — and, once a card has enough weekly prices, where its price sits in its own recent range. A screen, not a prediction, and not financial advice. Free accounts see the top three.",
    when: "You're deciding what to pick up next and want to see what other players are looking at.",
    href: "/tools/rising",
    cta: "Open Rising Cards",
    tier: "plus",
  },
  {
    title: "Set tracker: whole sets, no limit",
    body: `Tick what's in your binder and see how far through Origins or Spirit Forged you are, what's missing, and the cheapest listing for each missing card in your country, before postage. Count the base set, or every printing we track (alt-arts, overnumbered prints and Signatures). Importing a CSV of your binder, with the printing kept, is free. The tracker is free for your first ${FREE_PORTFOLIO_LIMIT} cards; Plus removes the limit so a whole set fits, and nobody loses cards they already have.`,
    when: "You're completing a set and want to know what's left without keeping a spreadsheet.",
    href: "/portfolio/sets",
    cta: "Open the set checklist",
    tier: "plus",
  },
  {
    title: "Best Basket's store-by-store plan",
    body: "Send a decklist or your watchlist, tick “skip copies I already own”, and get the cheapest delivered order across your country's stores — postage and free-shipping thresholds counted — beside the best one-store and two-store orders; or send your binder to see what replacing it would cost. Every signed-in account sees its own total and saving first, in money; Premium shows which store to buy each card from, with the links.",
    when: "Buying a whole deck or list: the saving on your own list is a number you can check before you pay.",
    href: "/tools/best-basket",
    cta: "Open Best Basket",
    tier: "premium",
  },
  {
    title: "Finish this set: the store-by-store plan for what's missing",
    body: `Press "Plan the purchase" on your set checklist, or choose "Finish a set" in Best Basket, and it prices the cards you're missing from that set (one copy each, everything you own left out) as one delivered order with each store's measured postage. Count the base set or every printing we track, limit it to a rarity, and leave out cards dearer than a price you set. A plan holds up to ${SET_GAP_CHUNK} cards: a bigger gap is planned ${SET_GAP_CHUNK} at a time, cheapest first, and it says how many more are not included. Cards no tracked store has in stock are listed apart. Non-foil listings. Every signed-in account sees its own total and saving; Premium shows which store to buy each card from, with the links.`,
    when: "You're most of the way through a set and want the rest ordered without a dozen small postage bills.",
    href: "/portfolio/sets",
    cta: "Open the set checklist",
    tier: "premium",
  },
  {
    title: "Minimum condition",
    body: "Set the lowest condition you'll accept: Near Mint only, Lightly Played or better, or anything. Best Basket's plan, Buy this list and the deck price watch then only use listings at or above it, so the cheapest plan can't quietly include a heavily played copy. Every line still shows its condition, a card with nothing at that grade in stock is shown as not covered rather than filled with a played copy, and the deck watch email uses the same rule as the page. Without Premium, your own total counts each store's cheapest copy in any condition and tells you how many played copies that includes.",
    when: "You play your cards, or you're completing a collection, and want the cheapest copy in the condition you'll actually accept.",
    href: "/tools/best-basket",
    cta: "Open Best Basket",
    tier: "premium",
  },
  {
    title: "No ads, and no limits on your watchlist or portfolio",
    body: `Plus and Premium remove every ad on every page, on the website and in the app, from the moment you subscribe. A free account watches up to ${FREE_WATCHLIST_LIMIT} cards and keeps up to ${FREE_PORTFOLIO_LIMIT} in its portfolio; a paid plan has no limit on either. Cards you already track stay if you're over a limit or your subscription ends. Price comparison stays free for everyone, with no limit.`,
    when: "You use the site every week and want it to just work.",
    href: "/watching",
    cta: "Open your watchlist",
    tier: "plus",
  },
  // Demand Finder stays Premium but no longer leads (2026-09-29, the personas pass):
  // for someone buying at a launch it reads as "what to buy before it spikes", the
  // tone the community punished. It is described as what it counts: searches.
  {
    title: "Demand Finder: what people are searching for",
    body: "The cards players are searching for and opening most on RiftCompare, over the last 7 or 30 days: the top 25 by searches and the top 25 by card views, with both counts and your market's price for every card. A count of what people looked at, not a forecast or a reason to buy. Everyone gets the top 10 most searched this week free.",
    when: "You're curious what other players are looking at this week.",
    href: "/tools/demand",
    cta: "Open Demand Finder",
    tier: "premium",
  },
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
    q: "I'm new — what do I actually get?",
    a: `Without an account: every Riftbound card's price compared across every store we track in your country, plus eBay, with the delivered total (item price plus postage) where the store publishes its postage — free, with no limit. A free account adds a watchlist (up to ${FREE_WATCHLIST_LIMIT} cards, with an email when one hits a new low), a portfolio (up to ${FREE_PORTFOLIO_LIMIT} cards) with a set checklist that shows what each set is missing and the cheapest listing to finish it, the top three of Deal Finder and Rising Cards, and your own Best Basket total. Plus and Premium watch prices FOR you: your own target price on cards, sealed products back in stock or at RRP, and (Premium) a whole deck's delivered total, checked after every price update (sealed products about every six hours) — with no ads. Nothing you already track is ever taken away.`,
  },
  {
    q: "What's free vs what needs Plus or Premium?",
    a: `Price comparison, the card database, the deck and list pricer, trade calculator and box EV are free for everyone, with no limit. A free account adds a watchlist of up to ${FREE_WATCHLIST_LIMIT} cards with weekly new-low emails, a portfolio of up to ${FREE_PORTFOLIO_LIMIT} cards (including its delivered replacement cost) with the set checklist, the top three of Deal Finder and Rising Cards, and your own Best Basket total; everyone sees the top 10 most searched cards of the week. ${
      premiumPlusEnabled()
        ? `Plus (${tierMonthlyAmount("plus")}/mo) removes every ad and the watchlist and portfolio limits, and adds target-price alerts on up to ${PLUS_TARGET_ALERT_LIMIT} cards, sealed watches on up to ${SEALED_WATCH_LIMIT_PLUS} products (an email when a box is back in stock or at RRP), the full Deal Finder (filterable to only your cards) and the full Rising Cards list. Premium (${tierMonthlyAmount("premium")}/mo) adds a deck price watch (up to ${DECK_WATCH_LIMIT} saved lists re-priced delivered, emailed at your price), unlimited target alerts and sealed watches, Best Basket's store-by-store plan (at the minimum condition you set), Buy this list for your deck, watchlist or binder, Finish this set for the cards a set is missing, the plan behind your replacement cost, and Demand Finder's full most-searched and most-viewed lists.`
        : `Premium (${tierMonthlyAmount("premium")}/mo) removes every ad and the watchlist and portfolio limits, and adds target-price alerts, sealed watches (an email when a box is back in stock or at RRP), a deck price watch (up to ${DECK_WATCH_LIMIT} saved lists re-priced delivered, emailed at your price), the full Deal Finder and Rising Cards lists, Best Basket's store-by-store plan, Buy this list and Demand Finder.`
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
  // Trial questions only while a trial exists (PREMIUM_TRIAL_DAYS > 0; off by
  // default since 2026-09-26) — this answer used to render unconditionally.
  ...(premiumTrialEnabled()
    ? [
        {
          q: "What happens when the trial ends?",
          a: `If you haven't cancelled, the card on file is charged and your subscription continues automatically at whichever plan you chose — ${introFromLine()}${introOfferEnabled() ? " (the half-price months are for new subscribers)" : ""}. We email you a day or two before it converts.`,
        },
      ]
    : []),
  {
    q: "What is a deck price watch?",
    a: `A Premium feature. Save a deck or card list (from Best Basket or the deck pricer) with the delivered price you'd pay — delivered means the cards plus each store's postage. After every price update we re-price the whole list across every store in your country, the way Best Basket does, and email you when the total is at or under your price, or, with no price set, when it drops at least 5% and a whole unit below the last figure we told you. The email names the total, the postage, the stores and a button to the store-by-store plan. Up to ${DECK_WATCH_LIMIT} lists; stop or snooze any of them from the email or your watchlist.`,
  },
  {
    q: "Do I have to pay to see what my set is missing?",
    a: `No. A free account can tick up to ${FREE_PORTFOLIO_LIMIT} cards, see its progress and the missing list, and export it. Plus removes the ${FREE_PORTFOLIO_LIMIT}-card limit so a whole set fits. If you already hold more than that you keep all of them; the limit only stops adding a new card.`,
  },
  {
    q: "Is the cost to finish what I would actually pay?",
    a: "It's the cheapest in-stock store listing for each missing card in your country, before postage. Cards no tracked store has in stock are counted separately with no price, and cards only eBay lists are left out of the total. It's a way to see what's left, not a promise of one order: Best Basket picks stores and adds measured postage.",
  },
  {
    q: "What does Finish this set do?",
    a: `It turns what your set checklist says is missing into a delivered order. Best Basket prices one copy of each missing card, with the cards you own left out, from your country's stores with each store's measured postage; any signed-in account sees its own total, postage and store count, and Premium shows which store to buy each card from. A plan holds up to ${SET_GAP_CHUNK} cards: if more are missing it plans the ${SET_GAP_CHUNK} cheapest and says how many more are not included, with a step to the next ${SET_GAP_CHUNK}. Cards no tracked store has in stock are listed apart, and it uses non-foil listings only. A set that hasn't been released has nothing to order yet.`,
  },
  {
    q: "What does minimum condition do?",
    a: "Best Basket, Buy this list and the deck price watch only use listings at or above the grade you choose (Near Mint only, Lightly Played or better, or anything). Each line still shows its condition. If nothing at that grade is in stock, the card is shown as not covered rather than filled with a played copy. It is a Premium setting: a new Best Basket session starts on Lightly Played or better with Anything one tap away, your last choice is remembered, and a deck watch saved before this keeps counting every condition until you change it. Without Premium your total counts each store's cheapest copy in any condition and says how many played copies that includes.",
  },
  {
    q: "How many cards can Finish this set plan at once?",
    a: `Up to ${SET_GAP_CHUNK} at a time. If you're missing more, it plans your cheapest ${SET_GAP_CHUNK} and tells you how many aren't included, then you can plan the next ${SET_GAP_CHUNK}. It never quietly leaves cards out.`,
  },
  {
    q: "How often are sealed watches checked?",
    a: `${SEALED_CHECK_CADENCE.charAt(0).toUpperCase()}${SEALED_CHECK_CADENCE.slice(1)}, and every email says when the store was last read. That's fast enough for a box that stays up for a few hours, and not fast enough to beat a bot that checks every minute. At-RRP alerts exist only where we publish an RRP (Australia, the US and the UK), and never for a pre-order set until an official price exists.`,
  },
  {
    q: "Why does Radiance show \"N revealed\" instead of a percentage?",
    a: "Cards appear in our catalogue as they're revealed and the printed total is still unsettled, so we count against what we can list today. The number grows as reveals land and settles once the set is released.",
  },
  {
    q: "Do you predict prices or tell me when to buy?",
    a: "No. Rising Cards and the Deal Finder show what stores charge today, and Demand Finder shows what people are searching for. Watches tell you when a price, restock or listing matches something you set.",
  },
  {
    q: "What is a sealed watch?",
    a: `A Plus and Premium feature for booster boxes, bundles, Proving Grounds and other sealed products. Tap the heart on a product on the sealed page (or in its quick view) and we email you when it is back in stock after being sold out at every store we track for several hours, when a store has it at or under RRP (the price Riot sets), when it reaches a price you set, or when it drops for real. Sealed products are checked ${SEALED_CHECK_CADENCE} (four store reads a day, and a scheduled run can start late), and every email says when the store was last read, because stock can sell out again before you get there. A Discord stock bot may be faster. A restock email comes at most once every six hours per product, the others at most once a day, and never from an eBay listing or a price reference. Plus watches up to ${SEALED_WATCH_LIMIT_PLUS} products; Premium has no limit you will meet (an account holds up to ${SEALED_WATCH_HARD_CAP}).`,
  },
  {
    q: "What happens to cards I already track?",
    a: `You keep them all. The free limits (${FREE_WATCHLIST_LIMIT} watched cards, ${FREE_PORTFOLIO_LIMIT} portfolio cards) only apply when you add a NEW card: if you already track more, every one of them stays, your alerts keep firing and your portfolio keeps its value. You can still change quantities, conditions and prices, and remove cards. Only a new card needs ${premiumPlusEnabled() ? "Plus" : "Premium"}. The same goes if a subscription ends: nothing is deleted.`,
  },
  {
    q: "How do I cancel?",
    a: `From this page, use "Manage subscription" to open Stripe's billing portal and cancel in a couple of clicks — no email or phone call needed. You keep access until the end of the period you already paid for${
      premiumTrialEnabled() ? " (or, during a trial, until it ends — and a trial cancelled before it ends is never charged)" : ""
    }.`,
  },
  {
    q: "Is Plus really ad-free?",
    a: `Yes. Plus and Premium both remove every ad on every page, on the website and in the app, from the moment you subscribe${premiumTrialEnabled() ? " — the free trial included" : ""}. It is the first thing Plus does${premiumPlusEnabled() ? `, and at ${tierMonthlyAmount("plus")}/mo it is the cheapest way to browse RiftCompare without ads` : ""}.`,
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
  {
    q: "Monthly or annual — what's the difference?",
    a: `Same features either way. Monthly is ${premiumPlusEnabled() ? `${tierMonthlyAmount("plus")}/${PREMIUM_PRICE_PERIOD} for Plus or ` : ""}${PREMIUM_PRICE_AMOUNT}/${PREMIUM_PRICE_PERIOD}${premiumPlusEnabled() ? " for Premium" : ""} with no commitment; annual is ${premiumPlusEnabled() ? `${tierAnnualAmount("plus")}/yr or ` : ""}${PREMIUM_ANNUAL_AMOUNT}/yr, billed once a year, which works out cheaper per month. Switch from monthly to annual anytime from your account once your first payment has gone through.`,
  },
  {
    q: "Which plan is worth it?",
    a: "Depends entirely on how you buy. Plus is for someone who buys singles or sealed regularly: it takes the ads away, shows every card below TCGplayer market, emails you the store when a card you watch reaches the price you set, and emails you when a box you watch is back in stock or at RRP. Premium is for buying a whole deck or list: a deck price watch re-prices your saved list delivered after every update and emails you when it reaches your price, and Best Basket shows the cheapest delivered order next to the best single-store order, so the saving on your own list is a number you can check (every signed-in account sees its own total before paying) rather than a claim we make. Premium also opens Demand Finder, the full list of cards players are searching for and opening. If you only buy the occasional single card, the free account is genuinely all you need — that's deliberate.",
  },
  ...(premiumPlusEnabled()
    ? [
        {
          q: "Can I upgrade from Plus to Premium later?",
          a: `Yes — one click from this page once your first payment has gone through${premiumTrialEnabled() ? " (plan changes aren't available during the free trial)" : ""}. You're only charged the prorated difference for the rest of your current billing period, on the same monthly or annual cycle, and the deck price watch, unlimited target alerts and sealed watches, Best Basket's store-by-store plan, Buy this list and Demand Finder unlock immediately.`,
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

      {/* Header. Subhead dropped the "$0 today" framing 2026-09-11 — see
          DECISIONS.md — in favour of a plain statement of what Premium is
          for, closer to how mtgstocks.com/go-premium frames its own hero
          ("[the site] is a labor of love..."). The real trial length is
          still named, just no longer built around a "$0" headline number. */}
      <div className="text-center">
        <span className="chip mb-3 inline-flex bg-gold/15 font-bold uppercase tracking-wide text-gold">Premium</span>
        <h1 className="font-display text-3xl font-extrabold text-white sm:text-4xl">
          {already ? `You're ${TIER_NAMES[currentTier ?? "premium"]}` : "Know what you're missing. Buy it for less."}
        </h1>
        {/* The 2026-09-25 subline: one sentence per tier, what each is FOR.
            The trial clause reads trialAvailable (this viewer can really
            start one), not premiumTrialEnabled(): a returning trialist was
            being promised a second trial here that checkout won't give. */}
        {/* The personas pass (2026-09-29): the hero names the two things people
            do here, in the order they do them, and the subline says what is
            free before what is paid. It quotes no price and no saving figure. */}
        {!already && (
          <p className="mx-auto mt-3 max-w-xl text-base font-semibold leading-relaxed text-slate-200">
            {plusLive
              ? "Comparing prices is free, and so is tracking what your binder is missing. Plus watches prices and stock for you. Premium plans the order: which stores, what postage, in the condition you'll play."
              : "Comparing prices is free, and so is tracking what your binder is missing. Premium watches prices and stock for you and plans the order: which stores, what postage, in the condition you'll play."}
          </p>
        )}
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
          {already
            ? "Everything you've unlocked is below — jump straight into any of it. Thanks for supporting RiftCompare."
            : `Nothing about seeing a price is ever paid. ${plusLive ? "Plus and Premium fund" : "Premium funds"} the servers and the price data behind the site, and ${plusLive ? "both are" : "it is"} ad-free${
                trialAvailable ? ` — every plan starts with a ${PREMIUM_TRIAL_DAYS}-day free trial` : ""
              }${introEligible ? `, and monthly plans are half price for the first ${INTRO_MONTHS} months` : ""}.`}
        </p>
      </div>

      {/* WHO IT IS FOR (2026-09-29, the personas pass): one block per kind of
          player, what is free for them first and then what Plus and Premium add,
          with a link to the real page. Above the per-feature cards, which follow
          for anyone who wants every feature spelled out. */}
      {!already && (
        <div className="mt-8">
          <h2 className="mb-1 text-center text-lg font-extrabold text-white">Start with what you do</h2>
          <p className="mb-4 text-center text-xs text-slate-500">
            Each of these begins with what&apos;s free. Nothing here predicts a price or tells you when to buy.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {personaSections().map((sec) => (
              <section key={sec.eyebrow} className="card-surface flex flex-col p-4">
                <div className="text-[11px] font-bold uppercase tracking-widest text-brand-400">{sec.eyebrow}</div>
                <h3 className="mt-1 font-bold text-white">{sec.headline}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{sec.body}</p>
                <ul className="mt-3 flex-1 space-y-1.5 text-[13px] text-slate-300">
                  {sec.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 [font-feature-settings:'lnum'_1]">
                      <span className="mt-0.5 font-bold text-brand-400">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href={sec.href} className="btn-ghost mt-4 self-start text-sm">{sec.cta} →</Link>
              </section>
            ))}
          </div>
        </div>
      )}

      {/* WHAT EACH PAID FEATURE DOES — before the prices (2026-09-29), one
          card per feature: what it does, when you'd use it, which tier. The
          prices, the tier table and the FAQ follow. */}
      <div className="mt-8">
        <h2 className="mb-1 text-center text-lg font-extrabold text-white">What {plusLive ? "Plus and Premium do" : "Premium does"}</h2>
        <p className="mb-4 text-center text-xs text-slate-500">
          Each one in plain words: what it does, and when you&apos;d use it. &ldquo;Delivered&rdquo; means the item price plus postage;
          RRP is the price Riot sets.
        </p>
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
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                <span className="font-semibold text-slate-300">What it does: </span>
                {f.body}
              </p>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-400">
                <span className="font-semibold text-slate-300">When you&apos;d use it: </span>
                {f.when}
              </p>
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

      {/* Pricing */}
      {/* THE LOCK-IN BANNER: only while a real, higher price is announced
          (premiumPriceIncreaseAnnounced — NEXT_PUBLIC_PREMIUM_NEXT_PRICE_AMOUNT
          set above today's price). From 2026-09-22 it rendered in both states,
          the steady one saying "the price goes up as the site grows, your rate
          doesn't". On 2026-09-26 the owner CUT the price and moved existing
          subscribers down onto the new Prices, so that copy promised
          protection from a rise nobody had decided — retired, see
          lib/site.ts's lock-in block and DECISIONS.md, 2026-09-26.

          It stays inside the `!already` gate: someone who is already a member
          has nothing to "lock in", and the banner would read as a threat to
          the rate they already hold. */}
      {!already && (
        <>
          {premiumPriceIncreaseAnnounced() && (
            <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-gold/40 bg-gold/10 px-5 py-3 text-center">
              <p className="text-sm font-bold text-gold">{premiumLockInHeadline()}</p>
              <p className="mt-1 text-xs text-gold/80 [[data-theme=light]_&]:text-gold">
                New subscribers will pay {PREMIUM_NEXT_PRICE_AMOUNT}/{PREMIUM_PRICE_PERIOD} once the change takes
                effect. Subscribe today and keep {PREMIUM_PRICE_AMOUNT}/{PREMIUM_PRICE_PERIOD} for as long as your
                subscription stays active — no action needed later.
              </p>
            </div>
          )}

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
          {premiumPriceIncreaseAnnounced() && (
            <p className="mx-auto mt-1 max-w-2xl text-center text-[11px] font-medium text-gold/80 [[data-theme=light]_&]:text-gold">{premiumLockInLine()}</p>
          )}
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
          <Link href="/portfolio/sets" className="btn-ghost">Set checklist</Link>
          {checkoutLive && <ManageSubscriptionButton />}
        </div>
      )}

      {/* Feature comparison */}
      <div className="mt-10">
        <h2 className="mb-1 text-center text-lg font-extrabold text-white">Feature comparison</h2>
        <p className="mb-3 text-center text-xs text-slate-500">
          {plusLive
            ? "See exactly what you get with each tier — Plus goes ad-free, lifts the watchlist and portfolio limits (so a whole set fits in the set tracker), unlocks the full lists and watches cards and sealed products for you; Premium adds the store-by-store plans, the minimum condition, the deck price watch and Demand Finder on top."
            : "See exactly what you get with each tier — Premium goes ad-free and adds the full lists, the watches, the list tools and Demand Finder."}
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
        <p className="mt-4 text-center text-xs text-slate-500">
          Prefer the long version? Every feature, one at a time:{" "}
          <Link href="/blog/riftcompare-premium-explained" className="text-brand-400 hover:underline">
            RiftCompare Plus and Premium, explained
          </Link>
          .
        </p>
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
