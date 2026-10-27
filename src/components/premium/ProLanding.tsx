import Link from "next/link";
import { ProPricePicker, type ProCtaProps, type ProPriceFigures } from "./ProPricePicker";
import { type SiteRating } from "@/lib/site-rating";
import { SiteRatingBadge } from "@/components/SiteRatingBadge";
import { ReviewsSection } from "@/components/ReviewsSection";
import { FREE_HISTORY_DAYS } from "@/lib/history-access";
import { FREE_PLANS_PER_MONTH } from "@/lib/basket-meter";
import { DECK_LINE_CAP, FREE_BULK_LINES } from "@/lib/deck";
import { DECK_WATCH_LIMIT } from "@/lib/alert-limits";

// /premium FOR A VISITOR WHO HAS NOT BOUGHT, laid out like Collectr's PRO page
// (owner, 2026-10-26: "let's pretty much just copy exactly how they do it",
// with screenshots). DECISIONS.md, "Pro: Collectr's model, $6.99 or $3.99/mo
// yearly". Supersedes the 2026-10-25 "one plan table and one comparison".
//
//   1. Hero: PRO chip, two-line headline, four ticks, the price with its
//      Monthly/Annual switch, one gold button, "Cancel anytime · See all
//      features", and the site's star rating when there is one to show.
//      Beside it, an example of what Pro shows (labelled as an example).
//   2. Key features: nine cards, each a real Pro feature.
//   3. Pricing: Free beside Pro, the Pro card with its own switch.
//
// Every price comes from lib/site.ts through the page; every limit from the
// constants the features enforce. Nothing here claims a number we do not have:
// the rating line is real ratings only (lib/site-rating.ts) and is left out
// below its threshold.

const HERO_TICKS = [
  "Unlimited store-by-store buying plans",
  "Full price history, with CSV",
  "Price alerts on every card",
  "No ads, anywhere",
];

const FEATURES: { icon: string; title: string; body: string }[] = [
  { icon: "🧺", title: "Best Basket plans", body: "The cheapest way to buy a whole deck or list, store by store, postage included. As many plans as you like." },
  { icon: "📈", title: "Full price history", body: `Every day we have recorded, for every card, with a CSV download. Free accounts see ${FREE_HISTORY_DAYS} days.` },
  { icon: "🔔", title: "Target-price alerts", body: "Set your price on any card and we email you when a store hits it." },
  { icon: "📦", title: "Sealed watches", body: "Back in stock, at RRP or at your price, on every sealed product." },
  { icon: "🃏", title: "Deck price watch", body: `Up to ${DECK_WATCH_LIMIT} saved decks re-priced delivered after every update, and an email at your price.` },
  { icon: "🔥", title: "Every deal and riser", body: "The full Deal Finder and Rising Cards lists, not just the top three." },
  { icon: "🔎", title: "Demand Finder", body: "The cards players are searching for and opening this week." },
  { icon: "📋", title: "Bulk price a list", body: `Paste a binder or a buylist: ${DECK_LINE_CAP} lines priced at once (${FREE_BULK_LINES} free).` },
  { icon: "✨", title: "No ads", body: "Every page, ad-free, for as long as you are a member." },
];

const FREE_ROWS: { text: string; on: boolean }[] = [
  { text: "Compare prices across every store", on: true },
  { text: "Unlimited watchlist and new-low emails", on: true },
  { text: "Unlimited portfolio and set checklist", on: true },
  { text: `${FREE_HISTORY_DAYS} days of price history`, on: true },
  { text: `Best Basket total, ${FREE_PLANS_PER_MONTH} plans a month`, on: true },
  { text: "Full price history and CSV", on: false },
  { text: "Target-price alerts on every card", on: false },
  { text: "Sealed and deck watches", on: false },
  { text: "Every deal, riser and demand row", on: false },
];

const PRO_ROWS = [
  "Everything in Free",
  "Unlimited Best Basket plans",
  "Full price history and CSV",
  "Target-price alerts on every card",
  "Sealed watches on every product",
  `Deck price watch (${DECK_WATCH_LIMIT} decks)`,
  "Full Deal Finder, Rising and Demand lists",
  `Bulk price ${DECK_LINE_CAP} lines`,
  "No ads",
];

/** An example of what Pro shows: labelled, illustrative, no claim about anyone's binder. */
function ExamplePanel() {
  const pts = [62, 60, 64, 63, 66, 65, 68, 67, 70, 69, 74, 73, 78, 92, 96, 97];
  const w = 300;
  const h = 120;
  const max = 100;
  const min = 55;
  const path = pts.map((v, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * w).toFixed(1)},${(h - ((v - min) / (max - min)) * h).toFixed(1)}`).join(" ");
  return (
    <div className="relative mx-auto w-full max-w-sm rounded-[2rem] border border-ink-700 bg-gradient-to-b from-ink-900 to-ink-950 p-5 shadow-2xl shadow-black/50">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
        <span className="text-white">Portfolio</span>
        <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[10px] uppercase tracking-widest">Example</span>
      </div>
      <div className="mt-3 text-3xl font-extrabold text-white">$1,284.50</div>
      <div className="text-xs font-semibold text-up">+$212.40 in the last 30 days</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 h-32 w-full" aria-hidden>
        <defs>
          <linearGradient id="pro-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#d9b04f" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#d9b04f" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L${w},${h} L0,${h} Z`} fill="url(#pro-fill)" />
        <path d={path} fill="none" stroke="#e2bd5c" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
      <div className="mt-3 flex justify-center gap-2 text-[11px] font-semibold text-slate-400">
        {["7D", "1M", "3M", "6M", "MAX"].map((r) => (
          <span key={r} className={`rounded-full px-2.5 py-1 ${r === "MAX" ? "bg-white text-ink-950" : "bg-ink-800"}`}>
            {r}
          </span>
        ))}
      </div>
      <div className="absolute -left-4 top-1/2 hidden rounded-2xl border border-ink-700 bg-ink-900/95 px-4 py-3 shadow-xl sm:block">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gold">Best Basket</div>
        <div className="text-sm font-extrabold text-white">Deck delivered</div>
        <div className="text-xs text-slate-400">store by store</div>
      </div>
      <div className="absolute -right-4 bottom-20 hidden rounded-2xl border border-ink-700 bg-ink-900/95 px-4 py-3 shadow-xl sm:block">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gold">Price alert</div>
        <div className="text-sm font-extrabold text-white">Hit your price</div>
      </div>
    </div>
  );
}

export function ProLanding({ prices, cta, rating }: { prices: ProPriceFigures; cta: ProCtaProps; rating: SiteRating | null }) {
  return (
    <div data-pro-landing>
      <section className="grid items-center gap-10 py-4 md:grid-cols-2 md:py-8">
        <div>
          <span className="inline-flex rounded-md bg-gradient-to-b from-[#f6dc8f] to-[#a97b2c] px-2.5 py-0.5 text-xs font-extrabold tracking-widest text-ink-950">PRO</span>
          <h1 className="mt-4 font-display text-5xl font-extrabold leading-[1.02] text-white sm:text-6xl">
            Collect Riftbound,
            <br />
            <span className="bg-gradient-to-r from-[#f6dc8f] via-[#d9b04f] to-[#a97b2c] bg-clip-text text-transparent">for less.</span>
          </h1>
          <ul className="mt-6 space-y-2.5">
            {HERO_TICKS.map((t) => (
              <li key={t} className="flex items-center gap-3 text-base font-semibold text-white">
                <span aria-hidden className="text-slate-200">✓</span>
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-7">
            <ProPricePicker prices={prices} cta={cta} size="hero" />
          </div>
          <p className="mt-3 max-w-md text-center text-sm text-slate-400">
            Cancel anytime ·{" "}
            <a href="#features" className="font-semibold text-gold underline underline-offset-2 hover:brightness-110">
              See all features
            </a>
          </p>
          <SiteRatingBadge rating={rating} className="mt-3 max-w-md" />
        </div>
        <ExamplePanel />
      </section>

      <section id="features" className="scroll-mt-header pt-12" aria-labelledby="pro-features">
        <div className="text-xs font-extrabold uppercase tracking-widest text-gold">Key features</div>
        <h2 id="pro-features" className="mt-2 font-display text-4xl font-extrabold text-white">Level up your collection.</h2>
        <p className="mt-2 max-w-md text-slate-400">From the cheapest way to buy a deck to every price we have ever recorded. Pro does the watching for you.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-ink-700 bg-ink-900/60 p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-lg" aria-hidden>
                {f.icon}
              </div>
              <h3 className="mt-4 font-extrabold text-white">{f.title}</h3>
              <p className="mt-1 text-sm leading-snug text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Real, consented, approved reviews, once the rating itself is shown
          (100+ ratings): Collectr puts its reviews between the features and
          the price. ReviewsSection renders nothing below its own minimum. */}
      {rating && (
        <div className="pt-16">
          <ReviewsSection />
        </div>
      )}

      <section id="pricing" className="scroll-mt-header pt-16 text-center" aria-labelledby="pro-pricing">
        <div className="text-xs font-extrabold uppercase tracking-widest text-gold">Pricing</div>
        <h2 id="pro-pricing" className="mt-2 font-display text-4xl font-extrabold text-white">Pick your plan.</h2>
        <p className="mx-auto mt-2 max-w-md text-slate-400">Start free. Upgrade to Pro when you&apos;re ready to buy smarter.</p>
        <div className="mx-auto mt-8 grid max-w-3xl gap-4 text-left md:grid-cols-2">
          <div className="rounded-2xl border border-ink-700 bg-ink-900/60 p-6">
            <div className="font-extrabold text-white">Free</div>
            <div className="mt-3 text-5xl font-extrabold text-white">$0</div>
            <p className="mt-1 text-xs text-slate-400">Best for getting started.</p>
            {cta.signedIn ? (
              <div className="mt-5 rounded-full border border-ink-700 py-3 text-center text-sm font-bold text-slate-300">Your current plan</div>
            ) : (
              <Link href="/login?next=/portfolio&src=pro_free" rel="nofollow" className="mt-5 block rounded-full border border-ink-700 bg-ink-800 py-3 text-center text-sm font-bold text-white hover:bg-ink-700">
                Create a free account
              </Link>
            )}
            <ul className="mt-5 space-y-2 text-sm">
              {FREE_ROWS.map((r) => (
                <li key={r.text} className={`flex gap-2 ${r.on ? "text-slate-200" : "text-slate-500"}`}>
                  <span aria-hidden className={r.on ? "text-up" : "text-slate-600"}>
                    {r.on ? "✓" : "✕"}
                  </span>
                  <span>
                    <span className="sr-only">{r.on ? "Included: " : "Not included: "}</span>
                    {r.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-gold/50 bg-gradient-to-b from-[#2a2110] to-ink-950 p-6 shadow-xl shadow-gold/10">
            <div className="flex items-center gap-2 font-extrabold text-white">
              RiftCompare Pro
              <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-gold">Recommended</span>
            </div>
            <div className="mt-3">
              <ProPricePicker prices={prices} cta={cta} size="card" />
            </div>
            <ul className="mt-5 space-y-2 text-sm text-slate-200">
              {PRO_ROWS.map((t) => (
                <li key={t} className="flex gap-2">
                  <span aria-hidden className="text-up">
                    ✓
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
