"use client";

import { useEffect, useRef, useState } from "react";
import { useMe, invalidateMe } from "@/lib/use-me";
import { useCountry } from "./CountryProvider";
import { useWatchlist } from "@/lib/use-watchlist";
import { CardSearch, type SearchCard } from "./CardSearch";
import { COUNTRY_LIST, type Country } from "@/lib/country";
import { trackEvent } from "@/lib/analytics";
import { PremiumButton } from "./PremiumButton";
import Link from "next/link";
import { FREE_PORTFOLIO_LIMIT, FREE_WATCHLIST_LIMIT } from "@/lib/free-limits";
import { isSignupSession } from "@/lib/signup-session";

const DISMISS_KEY = "rc_welcome_dismissed";
// Written by SignupWelcome.tsx the moment a ?welcome landing fires — not read
// here directly as a query param (that component strips it from the URL in
// the same effect, and both mount around the same time, so a param check here
// would race it). The stamp is the same signal, minus the race, and it stays
// true for a week instead of just the one landing.
const WELCOME_KEY = "rc_welcome_at";
const ELIGIBLE_MS = 7 * 24 * 60 * 60 * 1000;

// Inline, three-step onboarding — never a modal. Eligible for a signed-in
// account within 7 days of its ?welcome landing and not dismissed. Mounted at
// the top of /dashboard (where a sign-in with nowhere to return to lands, since
// 2026-09-29), on /profile (id="welcome") and by WelcomeBack on the homepage —
// same component, same completion state, wherever it renders.
//
// THE PREMIUM STEP (2026-09-23; DECISIONS.md, "Premium after sign-up"). A
// fourth, optional item: "Try Premium free". It is NOT counted in the 3/3 and
// it only appears once the account has watched a card — by then they have had
// something from the free account, so the ask does not read as a bait-and-
// switch on arrival. Never shown to a paying member, or while checkout is not
// configured. When the three core steps are done the checklist used to vanish,
// which meant anyone quick never saw the step at all; it now collapses to one
// short "you're set up" card carrying it, until dismissed or the week is up.
export function WelcomeChecklist() {
  const { user, loaded, premium, premiumCheckout, trialEligible, trialDays } = useMe();
  const { country, setCountry } = useCountry();
  const { watched, watch } = useWatchlist();
  const [eligible, setEligible] = useState(false);
  const [hasCollectionItem, setHasCollectionItem] = useState<boolean | null>(null);
  const fetchedCollection = useRef(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
      const stamp = Number(localStorage.getItem(WELCOME_KEY));
      // isSignupSession(): the landing itself counts even if this effect runs
      // before SignupWelcome's writes the stamp (lib/signup-session.ts).
      if ((Number.isFinite(stamp) && Date.now() - stamp < ELIGIBLE_MS) || isSignupSession()) setEligible(true);
    } catch {
      /* private mode — no onboarding, not worth failing over */
    }
  }, []);

  useEffect(() => {
    if (!eligible || !loaded || !user || fetchedCollection.current) return;
    fetchedCollection.current = true;
    fetch("/api/collection")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHasCollectionItem(Array.isArray(d?.items) && d.items.length > 0))
      .catch(() => setHasCollectionItem(false));
  }, [eligible, loaded, user]);

  if (!loaded || !user || !eligible) return null;

  const marketDone = user.preferredCountry != null;
  const watchDone = (watched?.size ?? 0) > 0;
  const collectionDone = hasCollectionItem === true;
  const doneCount = [marketDone, watchDone, collectionDone].filter(Boolean).length;
  // The Premium step: free accounts only, checkout live, and only after a watch.
  const offerPremium = !premium && premiumCheckout && watchDone;
  const trialOffer = trialEligible && trialDays > 0;
  if (doneCount === 3 && !offerPremium) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* best-effort */
    }
    setEligible(false);
  }

  // THE SET TRACKER (2026-09-29, the personas pass): what the binder is missing,
  // introduced right after the first card is added rather than as a fourth counted
  // step (the three core steps and their 3/3 stay as they were). Free within the
  // portfolio limit, so it says so.
  const setTrackerStep = (
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-white">See what a set is missing</p>
      <p className="text-xs text-slate-500">
        Tick what&apos;s in your binder and the set checklist shows what&apos;s missing and the cheapest listing for each card,
        before postage. Free for your first {FREE_PORTFOLIO_LIMIT} cards.
      </p>
      <div className="mt-2">
        <Link href="/portfolio/sets" className="btn-ghost text-sm">Open the set checklist →</Link>
      </div>
    </div>
  );

  const premiumStep = (
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-white">
        {trialOffer ? `Try Premium free for ${trialDays} days` : "See what Premium adds"}
      </p>
      <p className="text-xs text-slate-500">
        Plus and Premium watch prices for you: your own target price on cards, sealed products back in stock or at RRP, and (Premium)
        a whole deck&apos;s delivered price. Plus also removes the card limits, so a whole set fits; Premium plans the order, store
        by store, at the condition you&apos;ll play.{trialOffer ? " Cancel before the trial ends and you pay nothing." : ""}
      </p>
      <div className="mt-2">
        <PremiumButton surface="checklist" />
      </div>
    </div>
  );

  if (doneCount === 3) {
    return (
      <section id="welcome" className="card-surface mt-5 scroll-mt-header p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-white">You&apos;re set up</h2>
          <button onClick={dismiss} className="text-xs text-slate-500 hover:text-slate-300">
            3/3 done · Dismiss
          </button>
        </div>
        <div className="mt-3 flex items-start gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold/15 text-xs font-bold text-gold" aria-hidden="true">
            ✦
          </span>
          {premiumStep}
        </div>
        <div className="mt-4 flex items-start gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-300" aria-hidden="true">
            +
          </span>
          {setTrackerStep}
        </div>
      </section>
    );
  }

  return (
    <section id="welcome" className="card-surface mt-5 scroll-mt-header p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-white">Get the most out of your account</h2>
        <button onClick={dismiss} className="text-xs text-slate-500 hover:text-slate-300">
          {doneCount}/3 done · Dismiss
        </button>
      </div>

      <ul className="mt-3 space-y-4">
        <li className="flex items-start gap-3">
          <StepBadge done={marketDone} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Set your market</p>
            <p className="text-xs text-slate-500">See prices and stores for where you actually shop.</p>
            {!marketDone && (
              <select
                defaultValue=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  setCountry(e.target.value as Country);
                  invalidateMe();
                }}
                className="input mt-2 max-w-[14rem]"
              >
                <option value="" disabled>
                  Choose a market…
                </option>
                {COUNTRY_LIST.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </li>

        <li className="flex items-start gap-3">
          <StepBadge done={watchDone} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Watch a card</p>
            <p className="text-xs text-slate-500">
              Free: up to {FREE_WATCHLIST_LIMIT} cards, an email when one hits a new low. Plus also watches sealed products (back in
              stock, at RRP); Premium watches a whole deck&apos;s delivered price.
            </p>
            {!watchDone && (
              <div className="mt-2 max-w-sm">
                <CardSearch placeholder="Search a card to watch…" onPick={(c: SearchCard) => void watch(c.id, country)} />
              </div>
            )}
          </div>
        </li>

        <li className="flex items-start gap-3">
          <StepBadge done={collectionDone} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Add a card you own</p>
            <p className="text-xs text-slate-500">See what your collection is worth, valued live.</p>
            {!collectionDone && (
              <div className="mt-2 max-w-sm">
                <CardSearch
                  placeholder="Search a card you own…"
                  onPick={(c: SearchCard) => {
                    fetch("/api/collection", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ cardId: c.id }),
                    })
                      .then((r) => {
                        if (r.ok) {
                          setHasCollectionItem(true);
                          trackEvent("collection_add", { card_id: c.id });
                        }
                      })
                      .catch(() => {});
                  }}
                />
              </div>
            )}
          </div>
        </li>

        {collectionDone && (
          <li className="flex items-start gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-300" aria-hidden="true">
              +
            </span>
            {setTrackerStep}
          </li>
        )}

        {offerPremium && (
          <li className="flex items-start gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold/15 text-xs font-bold text-gold" aria-hidden="true">
              ✦
            </span>
            {premiumStep}
          </li>
        )}
      </ul>
    </section>
  );
}

function StepBadge({ done }: { done: boolean }) {
  return (
    <span
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
        done ? "bg-brand-500/20 text-brand-300" : "bg-ink-800 text-slate-500"
      }`}
      aria-hidden="true"
    >
      {done ? "✓" : ""}
    </span>
  );
}
