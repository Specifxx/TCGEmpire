"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { armNudge, countSessionView } from "@/lib/nudge-runtime";
import { BUY_CLICK_EVENT } from "@/lib/buy-intent";
import { useEscapeLayer } from "./ui/Dialog";
import { RatingReviewForm } from "./RatingReviewForm";
import {
  PRICING_NUDGE_SESSION_KEY,
  RATE_SESSION_KEY,
  RATE_STORAGE_KEY,
  countPageView,
  parseRateState,
  shouldAskRating,
  type RateState,
} from "@/lib/rate-prompt";

// "Rate RiftCompare" (owner, 2026-10-26; reworked 2026-10-27, DECISIONS.md "One
// rating ask, earned by engagement"; relaxed 2026-10-28, "Ratings: one tap
// counts, and the card asks at the moment it has earned"). When it asks is
// lib/rate-prompt.ts: never on arrival, never on the first page of a visit,
// after a few minutes and pages of real use or when they come back from a
// store tab they opened here, at most twice, a month apart, never in the same
// visit as the Pricing callout. A small corner card, not a modal: the page
// stays usable under it, and ✕, Escape and "Not now" all close it (snoozed),
// "Don't ask again" ends it.
//
// THE RATING DRIVE IS OVER (owner, 2026-11-03: "I think I've lost some
// visitors … because before there were too many pop ups"). The centred pop-up
// that asked every visitor on their landing page (2026-10-28 to 2026-11-03)
// is gone; DECISIONS.md, "One interruption per visit, never on arrival".
// Its body is the one rating-and-review form every surface uses
// (RatingReviewForm, source "rating"): stars first, then the review box.

const SHOW_DELAY_MS = 8_000;
/** After they come back from the store tab: long enough to settle, short enough to still be "just now". */
const RETURN_DELAY_MS = 1_500;

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

/** The Pricing callout already claimed this visit's one interruption. */
function otherPromptShown(): boolean {
  return sessionFlag(PRICING_NUDGE_SESSION_KEY);
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

  // Count every page view (never twice for one path change).
  useEffect(() => {
    const now = Date.now();
    save(countPageView(load(now), now));
  }, [path]);

  useEffect(() => {
    if (open) return;
    const visitPages = countSessionView("rc_rate_views", path); // the same path is not counted twice
    // "?rate=1": open it now (to see it, even after rating in this browser).
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("rate") === "1") {
      show();
      return;
    }
    const ask = () =>
      !sessionFlag(RATE_SESSION_KEY) &&
      shouldAskRating(load(Date.now()), Date.now(), path, { pages: visitPages, otherPromptShown: otherPromptShown() });
    if (!ask()) return;
    // Wait for a quiet moment on the page (no dialog, no typing), then check
    // again: the Pricing callout may have claimed the visit meanwhile.
    return armNudge({
      delayMs: SHOW_DELAY_MS,
      onFire: () => {
        if (ask()) show();
      },
    });
    // Not on `open`: closing must not re-arm the ask in the same visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // The high-intent moment: they clicked out to a store (a new tab) and came
  // back. The card asks then, while the price they found is fresh.
  useEffect(() => {
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onBuy = () => {
      armed = true;
    };
    const onVisible = () => {
      if (!armed || document.visibilityState !== "visible") return;
      armed = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const here = window.location.pathname;
        const visitPages = countSessionView("rc_rate_views", here); // the page already counted: no double count
        if (
          !sessionFlag(RATE_SESSION_KEY) &&
          shouldAskRating(load(Date.now()), Date.now(), here, {
            pages: visitPages,
            otherPromptShown: otherPromptShown(),
            intent: true,
          })
        )
          show();
      }, RETURN_DELAY_MS);
    };
    window.addEventListener(BUY_CLICK_EVENT, onBuy);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(BUY_CLICK_EVENT, onBuy);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function show() {
    const cur = load(Date.now());
    save({ ...cur, asks: cur.asks + 1 });
    try {
      sessionStorage.setItem(RATE_SESSION_KEY, "1");
    } catch {
      /* private mode */
    }
    setOpen(true);
  }

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

  const form = (
    <RatingReviewForm
      compact
      source="rating"
      page={path}
      onDone={() => {
        setDone(true);
        setTimeout(() => setOpen(false), 2500);
      }}
    />
  );

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
          <p className="mb-2 mt-1 text-sm text-slate-400">One tap. It helps other players find us.</p>
        </>
      )}
      {form}
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
