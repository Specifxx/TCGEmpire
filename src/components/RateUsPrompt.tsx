"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { armNudge, countSessionView } from "@/lib/nudge-runtime";
import { useEscapeLayer } from "./ui/Dialog";
import { RatingReviewForm } from "./RatingReviewForm";
import {
  RATE_SESSION_KEY,
  RATE_STORAGE_KEY,
  countPageView,
  parseRateState,
  shouldAskRating,
  type RateState,
} from "@/lib/rate-prompt";

// "Rate RiftCompare" (owner, 2026-10-26; reworked 2026-10-27, DECISIONS.md "One
// rating ask, earned by engagement"). When it asks is lib/rate-prompt.ts: never
// a new visitor, only a returning one after real use, at most twice ever, never in the same visit as the Pricing
// callout. A small corner card, not a modal: the page stays usable under it,
// and ✕, Escape and "Not now" all close it (snoozed), "Don't ask again" ends it.
// Its body is the one rating-and-review form every surface uses
// (RatingReviewForm, source "rating"): stars first, then the review box.

const SHOW_DELAY_MS = 8_000;
const PRICING_NUDGE_SESSION_KEY = "rc_pricing_nudge_seen"; // PricingNudge's own flag

function save(s: RateState) {
  try {
    localStorage.setItem(RATE_STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Private mode: nothing is remembered, and without a count it never asks.
  }
}

function load(now: number): RateState {
  try {
    return parseRateState(localStorage.getItem(RATE_STORAGE_KEY), now);
  } catch {
    return parseRateState(null, now);
  }
}

function sessionFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function RateUsPrompt() {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const now = Date.now();
    const s = countPageView(load(now), now);
    save(s);
    if (open) return;
    const visitPages = countSessionView("rc_rate_views", path);
    const ask = () =>
      !sessionFlag(RATE_SESSION_KEY) &&
      shouldAskRating(load(Date.now()), Date.now(), path, { pages: visitPages, otherPromptShown: sessionFlag(PRICING_NUDGE_SESSION_KEY) });
    if (!ask()) return;
    // Wait for a quiet moment on the page (no dialog, no typing), then check
    // again: the Pricing callout may have claimed the visit meanwhile.
    return armNudge({
      delayMs: SHOW_DELAY_MS,
      onFire: () => {
        if (!ask()) return;
        const cur = load(Date.now());
        save({ ...cur, asks: cur.asks + 1 });
        try {
          sessionStorage.setItem(RATE_SESSION_KEY, "1");
        } catch {
          /* private mode */
        }
        setOpen(true);
      },
    });
    // Counting page views only: re-running when `open` flips would count twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // ✕, Escape and "Not now": ask again after the snooze (a rater is done anyway).
  const close = () => {
    if (!done) save({ ...load(Date.now()), snoozedAt: Date.now() });
    setOpen(false);
  };

  const never = () => {
    save({ ...load(Date.now()), optedOut: true });
    setOpen(false);
  };

  useEscapeLayer(open, close);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Rate RiftCompare"
      data-rate-prompt
      className="above-bottombar fixed right-4 z-[70] w-[calc(100%-2rem)] max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl border border-ink-700 bg-ink-900/95 px-5 pb-4 pt-5 text-center shadow-2xl backdrop-blur"
    >
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="tap-icon absolute right-1.5 top-1.5 rounded-lg text-slate-400 hover:bg-ink-800 hover:text-white"
      >
        ✕
      </button>
      {!done && (
        <>
          <h2 className="pr-8 font-display text-lg font-extrabold text-white">How would you rate RiftCompare?</h2>
          <p className="mb-2 mt-1 text-sm text-slate-400">A few seconds. We only ask once.</p>
        </>
      )}
      <RatingReviewForm
        compact
        source="rating"
        page={path}
        onDone={() => {
          setDone(true);
          setTimeout(() => setOpen(false), 2500);
        }}
      />
      {!done && (
        <div className="mt-3 flex items-center justify-center gap-4 text-xs text-slate-500">
          <button type="button" onClick={close} className="tap-link hover:text-slate-300 hover:underline">
            Not now
          </button>
          <button type="button" onClick={never} className="tap-link hover:text-slate-300 hover:underline">
            Don&apos;t ask again
          </button>
        </div>
      )}
    </div>
  );
}
