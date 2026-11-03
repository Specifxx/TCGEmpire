import Link from "next/link";
import type { ReactNode } from "react";
import { ProPricePicker, type ProCtaProps, type ProPriceFigures } from "./ProPricePicker";
import { type SiteRating } from "@/lib/site-rating";
import { SiteRatingBadge } from "@/components/SiteRatingBadge";
import { ReviewsSection } from "@/components/ReviewsSection";
import { FREE_HISTORY_DAYS } from "@/lib/history-access";
import { FREE_PLANS_PER_MONTH } from "@/lib/basket-meter";
import { DECK_LINE_CAP, FREE_BULK_LINES } from "@/lib/deck";
import { DECK_WATCH_LIMIT } from "@/lib/alert-limits";

// /premium FOR A VISITOR WHO HAS NOT BOUGHT.
//
// IN THE SITE'S OWN THEME (owner, 2026-11-02: "noone's buying pro … it might
// look too gimmicky. We gotta make it look more professional and themed like
// the website with the website colours"). DECISIONS.md, "The Pro page, in the
// site's own theme". Replaces the 2026-10-26 Collectr copy's look (gold
// gradients, a giant gradient headline, emoji icons, a made-up portfolio
// mock-up with floating badges); the plan, the prices and the terms are
// unchanged ($6.99 a month or $47.88 a year; a free 3-day trial since 2026-11-03).
//
//   1. Hero: an orange eyebrow, a plain headline and one sentence, four ticks,
//      the star rating when there is one; beside it the plan card (Monthly /
//      Annual, the price, one orange button).
//   2. Real, approved reviews with the rating (none: no section).
//   3. What Pro adds: nine flat panels, each a real Pro feature, line icons.
//   4. Free and Pro side by side: one table with the real limits.
//
// Flat ink panels with hairline borders, the brand orange for the action, the
// numerals in the site's mono: the same surfaces every other page uses. Every
// price comes from lib/site.ts through the page; every limit from the
// constants the features enforce.

const HERO_TICKS = [
  "Unlimited store-by-store buying plans",
  "Every day of price history, with CSV",
  "Target-price alerts on every card",
  "No ads, anywhere",
];

// Line icons (24×24, 1.75 stroke), drawn in the link orange.
const ICONS: Record<string, ReactNode> = {
  basket: (
    <>
      <path d="M3 6h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.3h8.6a1.5 1.5 0 0 0 1.5-1.2L20.5 9H6" />
      <circle cx="9.5" cy="20.5" r="1" />
      <circle cx="17" cy="20.5" r="1" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path d="m7 15 4-4 3 3 6-7" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
    </>
  ),
  box: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </>
  ),
  deck: (
    <>
      <rect x="7" y="3" width="12" height="16" rx="2" />
      <path d="M4 7v12a2 2 0 0 0 2 2h9" />
    </>
  ),
  trend: (
    <>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h12M9 12h12M9 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

function Check({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  );
}

const FEATURES: { icon: keyof typeof ICONS; title: string; body: string }[] = [
  { icon: "basket", title: "Best Basket plans", body: "The cheapest way to buy a whole deck or list, store by store, postage included. As many plans as you like." },
  { icon: "chart", title: "Full price history", body: `Every day we have recorded, for every card, with a CSV download. Free accounts see ${FREE_HISTORY_DAYS} days.` },
  { icon: "bell", title: "Target-price alerts", body: "Set your price on any card and we email you when a store hits it." },
  { icon: "box", title: "Sealed watches", body: "Back in stock, at RRP or at your price, on every sealed product." },
  { icon: "deck", title: "Deck price watch", body: `Up to ${DECK_WATCH_LIMIT} saved decks re-priced delivered after every update, and an email at your price.` },
  { icon: "trend", title: "Every deal and riser", body: "The full Deal Finder and Rising Cards lists, not just the top three." },
  { icon: "search", title: "Demand Finder", body: "The cards players are searching for and opening this week." },
  { icon: "list", title: "Bulk price a list", body: `Paste a binder or a buylist: ${DECK_LINE_CAP} lines priced at once (${FREE_BULK_LINES} free).` },
  { icon: "shield", title: "No ads", body: "Every page, ad-free, for as long as you are a member." },
];

// Free beside Pro. `true` is a tick, `false` a dash, a string the real limit.
const COMPARISON: { feature: string; free: string | boolean; pro: string | boolean }[] = [
  { feature: "Compare prices across every store", free: true, pro: true },
  { feature: "Watchlist and new-low emails", free: "Unlimited", pro: "Unlimited" },
  { feature: "Portfolio and set checklist", free: "Unlimited", pro: "Unlimited" },
  { feature: "Price history", free: `${FREE_HISTORY_DAYS} days`, pro: "Every day, with CSV" },
  { feature: "Best Basket store-by-store plans", free: `${FREE_PLANS_PER_MONTH} a month`, pro: "Unlimited" },
  { feature: "Bulk price a list", free: `${FREE_BULK_LINES} lines`, pro: `${DECK_LINE_CAP} lines` },
  { feature: "Target-price alerts", free: false, pro: "Every card" },
  { feature: "Sealed watches", free: false, pro: "Every product" },
  { feature: "Deck price watch", free: false, pro: `${DECK_WATCH_LIMIT} decks` },
  { feature: "Full Deal Finder, Rising and Demand lists", free: false, pro: true },
  { feature: "No ads", free: false, pro: true },
];

function Cell({ value, pro }: { value: string | boolean; pro?: boolean }) {
  if (value === true)
    return (
      <span className="inline-flex justify-center">
        <Check className={pro ? "text-brand-400" : "text-slate-300"} />
        <span className="sr-only">Included</span>
      </span>
    );
  if (value === false)
    return (
      <span className="text-slate-600">
        <span aria-hidden>–</span>
        <span className="sr-only">Not included</span>
      </span>
    );
  return <span className={pro ? "font-semibold text-white" : "text-slate-300"}>{value}</span>;
}

// The free trial is offered to this viewer (signed out counts; the checkout
// route still decides with trialEligible). A paid trial ($1) never says "free".
function trialOn(cta: ProCtaProps): boolean {
  return cta.trialAvailable && cta.trialDays > 0 && cta.trialFeeCents === 0;
}

export function ProLanding({ prices, cta, rating }: { prices: ProPriceFigures; cta: ProCtaProps; rating: SiteRating | null }) {
  return (
    <div data-pro-landing>
      {/* On a phone the plan card comes straight after the headline, before
          the ticks, so the price and the button are on the first screens. */}
      <section className="grid items-start gap-x-12 gap-y-8 pt-2 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] md:grid-rows-[auto_1fr] md:gap-y-6 md:pt-6">
        <div className="md:col-start-1 md:row-start-1 md:pt-4">
          <span className="chip bg-brand-500/15 text-[11px] font-bold uppercase tracking-wider text-brand-400">RiftCompare Pro</span>
          <h1 className="mt-4 text-3xl leading-tight text-white sm:text-4xl">Buy Riftbound for less, and let us watch the prices.</h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-300">
            Pro plans the cheapest delivered order for any deck or list, emails you when a card or box hits your price, and keeps every
            day of price history. Comparing prices stays free.
          </p>
        </div>

        <div id="pro-plan" className="card-surface scroll-mt-header p-6 md:col-start-2 md:row-span-2 md:row-start-1">
          <div className="flex items-center justify-between">
            <h2 className="text-lg text-white">Pro</h2>
            <a href="#compare" className="text-xs font-semibold text-slate-400 hover:text-brand-400">
              Compare plans
            </a>
          </div>
          <div className="mt-4">
            <ProPricePicker prices={prices} cta={cta} />
          </div>
          <p className="mt-4 border-t border-ink-800 pt-4 text-center text-xs text-slate-400">
            {trialOn(cta) ? `${cta.trialDays} days free · ` : ""}Cancel anytime ·{" "}
            <a href="#features" className="font-semibold text-brand-400 hover:underline">
              See all features
            </a>
          </p>
        </div>

        <div className="md:col-start-1 md:row-start-2">
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {HERO_TICKS.map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-sm font-medium text-slate-200">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-400">
                  <Check className="h-3.5 w-3.5" />
                </span>
                {t}
              </li>
            ))}
          </ul>
          <SiteRatingBadge rating={rating} className="mt-6 !justify-start" />
        </div>
      </section>

      {/* Real, consented, approved reviews and the site's rating, straight
          under the hero (owner, 2026-11-03: "we need it visible on … the
          pricing page"). ReviewsSection renders nothing when there are none,
          and the wrapper hides itself then. */}
      <div className="pt-12 empty:hidden">
        <ReviewsSection rating={rating} />
      </div>

      <section id="features" className="scroll-mt-header pt-16" aria-labelledby="pro-features">
        <div className="rb-eyebrow text-brand-400">What Pro adds</div>
        <h2 id="pro-features" className="mt-2 text-2xl text-white sm:text-3xl">
          Everything you need to buy at the right price
        </h2>
        <p className="mt-2 max-w-2xl text-slate-400">From the cheapest way to buy a deck to every price we have recorded. Pro does the watching for you.</p>
        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-ink-800 bg-ink-800 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-ink-900 p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink-700 bg-ink-850 text-brand-400">
                  <Icon name={f.icon} />
                </span>
                <h3 className="font-sans text-base font-semibold text-white">{f.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="compare" className="scroll-mt-header pt-16" aria-labelledby="pro-compare">
        <div className="rb-eyebrow text-brand-400">Plans</div>
        <h2 id="pro-compare" className="mt-2 text-2xl text-white sm:text-3xl">
          Free and Pro, side by side
        </h2>
        <p className="mt-2 max-w-2xl text-slate-400">Start free. Upgrade when you want the plans, alerts and history.</p>
        <div className="card-surface mt-8 overflow-hidden">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">What Free and Pro include</caption>
            <thead>
              <tr className="border-b border-ink-800">
                <th scope="col" className="px-4 py-4 font-semibold text-slate-400 sm:px-6">
                  <span className="sr-only">Feature</span>
                </th>
                <th scope="col" className="w-[26%] px-2 py-4 text-center align-bottom sm:w-1/5 sm:px-4">
                  <div className="font-semibold text-white">Free</div>
                  <div className="mt-1 text-lg font-bold tabular-nums text-white">$0</div>
                </th>
                <th scope="col" className="w-[30%] bg-brand-500/[0.06] px-2 py-4 text-center align-bottom sm:w-1/4 sm:px-4">
                  <div className="font-semibold text-brand-400">Pro</div>
                  <div className="mt-1 text-lg font-bold tabular-nums text-white">
                    {prices.annualLive ? prices.perMonth : prices.monthly}
                    <span className="text-xs font-medium text-slate-400">/mo</span>
                  </div>
                  {prices.annualLive && <div className="mt-0.5 text-[11px] font-normal text-slate-400">billed yearly</div>}
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((r) => (
                <tr key={r.feature} className="border-b border-ink-800 last:border-0">
                  <th scope="row" className="px-4 py-3 font-normal text-slate-200 sm:px-6">
                    {r.feature}
                  </th>
                  <td className="px-2 py-3 text-center sm:px-4">
                    <Cell value={r.free} />
                  </td>
                  <td className="bg-brand-500/[0.06] px-2 py-3 text-center sm:px-4">
                    <Cell value={r.pro} pro />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-ink-800">
                <td className="px-4 py-4 sm:px-6" />
                <td className="px-2 py-4 text-center sm:px-4">
                  {cta.signedIn ? (
                    <span className="text-xs font-semibold text-slate-400">Your plan</span>
                  ) : (
                    <Link href="/login?next=/portfolio&src=pro_free" rel="nofollow" className="btn-ghost w-full px-2 text-xs">
                      Sign up free
                    </Link>
                  )}
                </td>
                <td className="bg-brand-500/[0.06] px-2 py-4 text-center sm:px-4">
                  <a href="#pro-plan" className="btn-primary w-full px-2 text-xs">
                    {trialOn(cta) ? "Try Pro free" : "Get Pro"}
                  </a>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
