"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { armNudge, countSessionView } from "@/lib/nudge-runtime";
import { BUY_CLICK_EVENT } from "@/lib/buy-intent";
import { Dialog, useEscapeLayer } from "./ui/Dialog";
import { RatingReviewForm } from "./RatingReviewForm";
import {
  RATE_SESSION_KEY,
  RATE_STORAGE_KEY,
  RATING_DRIVE_DELAY_MS,
  RATING_DRIVE_LANDING_MS,
  RATING_DRIVE_SESSION_KEY,
  RATING_DRIVE_TARGET,
  countPageView,
  parseRateState,
  shouldAskRating,
  shouldAskRatingDrive,
  type RateState,
} from "@/lib/rate-prompt";

// "Rate RiftCompare" (owner, 2026-10-26; reworked 2026-10-27, DECISIONS.md "One
// rating ask, earned by engagement"; relaxed 2026-10-28, "Ratings: one tap
// counts, and the card asks at the moment it has earned"). When it asks is
// lib/rate-prompt.ts: never on arrival, after a few minutes and pages of real
// use or when they come back from a store tab they opened here, at most three
// times, never in the same visit as the Pricing callout. A small corner card, not a modal: the page stays usable under it,
// and ✕, Escape and "Not now" all close it (snoozed), "Don't ask again" ends it.
// DURING THE RATING DRIVE (2026-10-28, under 100 ratings: lib/rate-prompt.ts)
// it is a centred pop-up for every visitor who has not rated, once per visit,
// with ✕, "Maybe later" and Escape but no "Don't ask again" and no closing by
// a click on the page behind; after the drive, the corner card again.
// Its body is the one rating-and-review form every surface uses
// (RatingReviewForm, source "rating"): stars first, then the review box.

const SHOW_DELAY_MS = 8_000;
/** After they come back from the store tab: long enough to settle, short enough to still be "just now". */
const RETURN_DELAY_MS = 1_500;
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

interface Drive {
  active: boolean;
  count: number | null;
}

/** The drive's state for this visit: cached in sessionStorage, else asked of /api/rating-drive once. */
async function loadDrive(): Promise<Drive> {
  try {
    const cached = sessionStorage.getItem(RATING_DRIVE_SESSION_KEY);
    if (cached) return JSON.parse(cached) as Drive;
  } catch {
    /* private mode: ask the API */
  }
  try {
    const res = await fetch("/api/rating-drive");
    const d = (await res.json()) as Partial<Drive>;
    const drive: Drive = { active: res.ok && d.active === true, count: typeof d.count === "number" ? d.count : null };
    try {
      sessionStorage.setItem(RATING_DRIVE_SESSION_KEY, JSON.stringify(drive));
    } catch {
      /* private mode */
    }
    return drive;
  } catch {
    return { active: false, count: null }; // unknown is off: never nag on an error
  }
}

export function RateUsPrompt() {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [drive, setDrive] = useState<Drive | null>(null);
  // How this ask was shown: the drive's pop-up or the corner card.
  const [popup, setPopup] = useState(false);
  const driveRef = useRef<Drive | null>(null);
  driveRef.current = drive;

  useEffect(() => {
    let live = true;
    loadDrive().then((d) => {
      if (live) setDrive(d);
    });
    return () => {
      live = false;
    };
  }, []);

  // Count every page view (never twice for one path change).
  useEffect(() => {
    const now = Date.now();
    save(countPageView(load(now), now));
  }, [path]);

  useEffect(() => {
    if (open || drive === null) return; // wait for the drive's answer
    const visitPages = countSessionView("rc_rate_views", path); // the same path is not counted twice
    if (drive.active) {
      const ask = () => shouldAskRatingDrive(load(Date.now()), path, sessionFlag(RATE_SESSION_KEY));
      if (!ask()) return;
      return armNudge({
        delayMs: visitPages >= 2 ? RATING_DRIVE_DELAY_MS : RATING_DRIVE_LANDING_MS,
        onFire: () => {
          if (ask()) show(true);
        },
      });
    }
    const ask = () =>
      !sessionFlag(RATE_SESSION_KEY) &&
      shouldAskRating(load(Date.now()), Date.now(), path, { pages: visitPages, otherPromptShown: sessionFlag(PRICING_NUDGE_SESSION_KEY) });
    if (!ask()) return;
    // Wait for a quiet moment on the page (no dialog, no typing), then check
    // again: the Pricing callout may have claimed the visit meanwhile.
    return armNudge({
      delayMs: SHOW_DELAY_MS,
      onFire: () => {
        if (ask()) show(false);
      },
    });
    // Not on `open`: closing must not re-arm the ask in the same visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, drive]);

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
        if (driveRef.current?.active) {
          if (shouldAskRatingDrive(load(Date.now()), here, sessionFlag(RATE_SESSION_KEY))) show(true);
          return;
        }
        if (
          !sessionFlag(RATE_SESSION_KEY) &&
          shouldAskRating(load(Date.now()), Date.now(), here, {
            pages: visitPages,
            otherPromptShown: sessionFlag(PRICING_NUDGE_SESSION_KEY),
            intent: true,
          })
        )
          show(false);
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

  function show(asPopup: boolean) {
    setPopup(asPopup);
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

  useEscapeLayer(open && !popup, close); // the pop-up's Dialog owns Escape itself

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

  if (popup) {
    const count = drive?.count ?? null;
    return (
      <Dialog open onClose={close} size="md" label="Rate RiftCompare" dismissOnBackdrop={false} className="px-5 pb-5 pt-6 text-center">
        <div data-rate-prompt data-rating-drive>
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
              <h2 className="px-6 font-display text-xl font-extrabold text-white">How would you rate RiftCompare?</h2>
              <p className="mb-3 mt-1 text-sm text-slate-400">
                {count !== null && count < RATING_DRIVE_TARGET
                  ? `We're collecting our first ${RATING_DRIVE_TARGET} ratings, and ${count} players have rated so far. One tap helps.`
                  : "One tap. It helps other players find us."}
              </p>
            </>
          )}
          {form}
          {!done && (
            <button type="button" onClick={close} className="tap-link mt-3 text-xs text-slate-500 hover:text-slate-300 hover:underline">
              Maybe later
            </button>
          )}
        </div>
      </Dialog>
    );
  }

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
