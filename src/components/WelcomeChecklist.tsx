"use client";

import { useEffect, useRef, useState } from "react";
import { useMe, invalidateMe } from "@/lib/use-me";
import { useCountry } from "./CountryProvider";
import { useWatchlist } from "@/lib/use-watchlist";
import { CardSearch, type SearchCard } from "./CardSearch";
import { COUNTRY_LIST, type Country } from "@/lib/country";
import { trackEvent } from "@/lib/analytics";

const DISMISS_KEY = "rc_welcome_dismissed";
// Written by SignupWelcome.tsx the moment a ?welcome landing fires — not read
// here directly as a query param (that component strips it from the URL in
// the same effect, and both mount around the same time, so a param check here
// would race it). The stamp is the same signal, minus the race, and it stays
// true for a week instead of just the one landing.
const WELCOME_KEY = "rc_welcome_at";
const ELIGIBLE_MS = 7 * 24 * 60 * 60 * 1000;

// Inline, three-step onboarding — never a modal. Eligible for a signed-in
// account within 7 days of its ?welcome landing and not dismissed; hides
// itself the moment all three steps are done, same as it does when it was
// never eligible. Mounted on /profile (id="welcome") and by WelcomeBack on
// the homepage — same component, same completion state, wherever it renders.
export function WelcomeChecklist() {
  const { user, loaded } = useMe();
  const { country, setCountry } = useCountry();
  const { watched, watch } = useWatchlist();
  const [eligible, setEligible] = useState(false);
  const [hasCollectionItem, setHasCollectionItem] = useState<boolean | null>(null);
  const fetchedCollection = useRef(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
      const stamp = Number(localStorage.getItem(WELCOME_KEY));
      if (Number.isFinite(stamp) && Date.now() - stamp < ELIGIBLE_MS) setEligible(true);
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
  if (doneCount === 3) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* best-effort */
    }
    setEligible(false);
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
            <p className="text-xs text-slate-500">Get emailed the moment its price drops to a new low.</p>
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
