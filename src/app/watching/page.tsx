import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Watchlist } from "@/components/Watchlist";
import { NavIcon } from "@/components/NavIcon";
import { PremiumNudgeCard } from "@/components/PremiumNudgeCard";
import { getPremiumNudge, nudgeCopy as watchedNudgeCopy } from "@/lib/premium-nudge";
import { isPremium, premiumCheckoutEnabled, premiumTierOf } from "@/lib/premium";
import { DECK_WATCH_LIMIT, PLUS_TARGET_ALERT_LIMIT, SEALED_WATCH_LIMIT_PLUS, sealedWatchLimit } from "@/lib/alert-limits";
import { getCountry } from "@/lib/get-country";
import { FREE_WATCHLIST_LIMIT } from "@/lib/free-limits";
import { getSealedGroups } from "@/lib/sealed-import";
import { DeckWatchList } from "@/components/DeckWatchList";
import { SealedWatchList, type SealedWatchName } from "@/components/SealedWatchList";
import { PremiumButton } from "@/components/PremiumButton";

// getCurrentUser() reads cookies(), so this route can never be cached. Declared
// explicitly rather than left to inference — a stray session read is what once
// killed ISR site-wide here.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My watchlist — cards you're tracking",
  description: "Every Riftbound card you're watching for a price drop, with the price you started tracking at.",
  // Personal page: never indexed. Deliberately NOT disallowed in robots.txt
  // either — a Disallow would stop Google seeing this noindex, which is exactly
  // how pages end up in the "Indexed, though blocked by robots.txt" bucket.
  robots: { index: false, follow: false },
};

// THE PATH IS /watching, NOT /watchlist, AND THAT IS DELIBERATE.
//
// next.config.js has redirected /watchlist -> /alerts (the price-alerts
// explainer) since long before this page existed, because "watchlist" is a
// keyword that page targets. Redirects in next.config.js are matched BEFORE
// routing, so a page at src/app/watchlist/ never renders at all — this one
// shipped dead, and every nav link pointing at it sent signed-in users to a
// marketing page instead of their own list.
//
// The obvious fix — delete the redirect — is the wrong one. It is
// `permanent: true`, i.e. a 308, which browsers cache indefinitely and which
// cannot be revoked from the server. Anyone who already hit /watchlist would
// keep being bounced to /alerts no matter what we serve there afterwards. So
// the personal page moves to a path that has never issued a redirect, and
// /watchlist keeps its SEO job pointing at the explainer.
//
// tests/watchlist.test.ts asserts no next.config.js redirect ever shadows an
// app route again.
export default async function WatchingPage() {
  const user = await getCurrentUser();
  // A redirect, not a blurred/gated page: an account wall rendered as content is
  // what the AdSense audit flags as a paywall.
  if (!user) redirect("/login?next=/watching");

  // What Deal Finder and Rising Cards say about THIS account's watched cards —
  // a Plus upsell for a free account, a link into the list for a member
  // (lib/premium-nudge.ts). Never fails the page.
  const member = isPremium(user);
  const onPlus = member && premiumTierOf(user) === "plus";
  const country = getCountry();
  const nudge =
    isPremium(user) || premiumCheckoutEnabled() ? await getPremiumNudge(user.id, getCountry()).catch(() => null) : null;
  const nudgeCopy = nudge ? watchedNudgeCopy(nudge, "watched", isPremium(user) ? "member" : "free") : null;
  const onPremium = member && premiumTierOf(user) === "premium";
  // Names for the member's sealed watches, from the self-cached groups read
  // (called directly — it caches itself; never wrapped). Members only: a free
  // account has no sealed watches to name.
  const sealedNames: Record<string, SealedWatchName> = {};
  if (member) {
    const groups = await getSealedGroups(country).catch(() => []);
    for (const g of groups) sealedNames[g.groupKey] = { name: g.name, lowestPriceCents: g.lowestPriceCents, msrpCents: g.msrpCents };
  }
  const sealedLimit = sealedWatchLimit(premiumTierOf(user));
  // A LAPSED owner keeps their sealed and deck watches (nothing is emailed),
  // and must be able to see and stop them: two cheap indexed counts, only for
  // an account that is not entitled to the section.
  const [lapsedSealed, lapsedDecks] = await Promise.all([
    member ? 0 : prisma.sealedWatch.count({ where: { userId: user.id } }).catch(() => 0),
    onPremium ? 0 : prisma.deckWatch.count({ where: { userId: user.id } }).catch(() => 0),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">My watchlist</span>
        </nav>
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-white sm:text-3xl">
          <NavIcon name="heart" className="h-6 w-6 shrink-0 text-brand-400" />
          My watchlist
        </h1>
        {/* Matches the code (lib/price-alerts.ts, lib/alert-price.ts): the
            price is the cheapest in-stock Near Mint copy at a store we track,
            never eBay; "watching from" is PriceAlert.startPriceCents (older
            watches show their last-checked price, labelled as such); the free
            email is the weekly digest — a new low at least 5% and 50 minor
            units under the price we last emailed (for 30 days, then the drop
            anchor: where the price stood before the slide), a first listing (labelled pre-order before release) or a
            restock; the paid triggers — a target (Plus: PLUS_TARGET_ALERT_LIMIT
            cards, Premium: any), a card at least 15% below TCGplayer market,
            and restocks — send after each price update, without the weekly
            wait. Snooze and pause are lib/alert-actions.ts and
            lib/alert-mute.ts. Plus is described as ad-free wherever it is
            described (lineup marketing rule). */}
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          Every card you&apos;re tracking, with the price it was at when you started. We email{" "}
          <strong className="text-slate-200">{user.email}</strong> when the cheapest Near Mint copy at a store hits a new
          low (at least 5% under the price we last told you), when a card is first listed or opens for pre-order, and when
          one is back in stock, naming the stores and their postage — at most one email a week.{" "}
          {member ? (
            <>
              Set your own price on {onPlus ? `up to ${PLUS_TARGET_ALERT_LIMIT} cards` : "any card"} below and we
              email you as soon as it&apos;s met — and when a card drops at least 15% below TCGplayer market, or is back
              in stock, after every price update.
            </>
          ) : (
            <>
              With Plus (ad-free), set your own price on up to {PLUS_TARGET_ALERT_LIMIT} cards and hear as soon as
              it&apos;s met, and when one drops below TCGplayer market.
            </>
          )}{" "}
          Every alert email has one-tap links to stop watching a card or snooze it for 30 days, and you can pause all alert
          emails without losing this list. Tap the heart on any card to stop watching it.{" "}
          {!member && (
            <>
              A free account watches up to {FREE_WATCHLIST_LIMIT} cards; if you already watch more, you keep them all.
            </>
          )}
        </p>
      </div>

      {nudgeCopy && <PremiumNudgeCard {...nudgeCopy} member={isPremium(user)} surface="nudge:watchlist" className="mb-5" />}

      {/* WHAT YOU CAN WATCH (2026-09-29, "Premium works while you're away"):
          three kinds, each in one plain line, so someone new to the site can
          tell a card watch from a target from a sealed or deck watch without a
          popup. The paid kinds carry the ordinary PremiumButton, inline. */}
      <section aria-labelledby="what-h" className="card-surface mb-5 p-4" data-watch-explainer>
        <h2 id="what-h" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          What you can watch
        </h2>
        <ul className="mt-2 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
          <li>
            <strong className="text-white">Cards</strong> — free, up to {FREE_WATCHLIST_LIMIT}. An email when a card you watch hits a new
            low at a store. <strong className="text-white">A target</strong> (Plus: {PLUS_TARGET_ALERT_LIMIT} cards, Premium: any) is your
            own price: we email you as soon as a store has it there.
          </li>
          <li>
            <strong className="text-white">Sealed products</strong> — Plus (up to {SEALED_WATCH_LIMIT_PLUS}) and Premium (any). Tap the
            heart on a box on /sealed: an email when it is back in stock after selling out everywhere, at RRP (the price Riot sets),
            or at your price.
            {!member && (
              <div className="mt-1.5">
                <PremiumButton tier="plus" surface="tip:watching" className="text-xs font-semibold text-brand-300 hover:underline">
                  See Plus →
                </PremiumButton>
              </div>
            )}
          </li>
          <li>
            <strong className="text-white">A whole deck</strong> — Premium, up to {DECK_WATCH_LIMIT} lists. Save a list from Best Basket
            or the deck pricer: we re-price it delivered (cards + postage) after every price update and email you when the total
            reaches your price.
            {!onPremium && (
              <div className="mt-1.5">
                <PremiumButton surface="tip:watching" className="text-xs font-semibold text-brand-300 hover:underline">
                  See Premium →
                </PremiumButton>
              </div>
            )}
          </li>
        </ul>
      </section>

      <Watchlist />

      {(member || lapsedSealed > 0) && (
        <section id="sealed" aria-labelledby="sealed-h" className="card-surface mt-8 scroll-mt-header p-5">
          <h2 id="sealed-h" className="font-display text-lg font-bold text-white">
            Sealed
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Checked after every price update: back in stock after selling out everywhere, at RRP, at your target, or a real drop.
          </p>
          <div className="mt-3">
            <SealedWatchList names={sealedNames} limit={Number.isFinite(sealedLimit) ? sealedLimit : null} lapsed={!member} />
          </div>
        </section>
      )}

      {(onPremium || lapsedDecks > 0) && (
        <section id="decks" aria-labelledby="decks-h" className="card-surface mt-8 scroll-mt-header p-5">
          <h2 id="decks-h" className="font-display text-lg font-bold text-white">
            Decks
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Each list is re-priced delivered — cards and postage, across every store — after every price update, the way Best Basket
            prices it.
          </p>
          <div className="mt-3">
            <DeckWatchList lapsed={!onPremium} />
          </div>
        </section>
      )}
    </div>
  );
}
