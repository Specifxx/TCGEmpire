"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMe, invalidateMe } from "@/lib/use-me";
import { trackEvent } from "@/lib/analytics";
import { PREMIUM_ANNUAL_AMOUNT, annualSavingPct } from "@/lib/site";

// RETENTION LEVER: nudge a monthly Premium subscriber onto the annual plan.
// Annual up-front is the single biggest churn win on a small-ticket consumer sub
// — it defers the cancel decision a full 12 months — and the switch is one click
// (POST /api/premium/switch-to-annual upgrades the live Stripe subscription with
// immediate proration).
//
// Audience is the exact opposite of PremiumSlideIn's: this only ever fires for a
// LOGGED-IN, PREMIUM, MONTHLY subscriber who has been paying a while, so the two
// corner nudges are mutually exclusive by `premium` and never collide. It is a
// non-modal corner slide-in (never covers content, never locks scroll, yields to
// any open modal via body[data-rc-dialog]) and is capped hard — once per session,
// a 30-day snooze after a "not now", and never again after two.

const SESSION_SEEN = "rc_annual_nudge_session";
const DISMISS_COUNT = "rc_annual_nudge_dismisses";
const SNOOZE_UNTIL = "rc_annual_nudge_until";

const MIN_MONTHS = 2; // let a monthly sub prove it's sticking before pitching a year up front
const DWELL_MS = 8_000;
const MAX_DISMISSALS = 2;
const SNOOZE_AFTER_DISMISS_MS = 30 * 864e5; // 30 days — this is a save-money offer, not a hard sell

function readNum(store: Storage | null, key: string): number {
  try {
    return Number(store?.getItem(key) ?? "0") || 0;
  } catch {
    return 0;
  }
}

export function AnnualSwitchNudge() {
  const { premium, loaded } = useMe();
  const [phase, setPhase] = useState<"hidden" | "offer" | "working" | "done" | "error">("hidden");
  const [entered, setEntered] = useState(false);
  const checked = useRef(false); // one subscription fetch per mount, max

  const hide = useCallback(() => {
    setEntered(false);
    setTimeout(() => setPhase("hidden"), 250);
  }, []);

  useEffect(() => {
    if (!loaded || !premium || checked.current) return;

    let ls: Storage | null = null;
    let ss: Storage | null = null;
    try {
      ls = window.localStorage;
      ss = window.sessionStorage;
    } catch {
      /* storage blocked — caps fail open to a single show */
    }
    // Caps first, so a capped user never triggers a Stripe read.
    if (readNum(ls, DISMISS_COUNT) >= MAX_DISMISSALS) return;
    if (Date.now() < readNum(ls, SNOOZE_UNTIL)) return;
    try {
      if (ss?.getItem(SESSION_SEEN) === "1") return;
    } catch {
      /* ignore */
    }

    checked.current = true;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    fetch("/api/premium/subscription", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        // Monthly, annual is configured, and they've stuck around a bit.
        if (d.interval !== "month" || !d.annualAvailable || (d.monthsActive ?? 0) < MIN_MONTHS) return;
        timer = setTimeout(() => {
          if (typeof document !== "undefined" && document.body.dataset.rcDialog === "1") return;
          try {
            ss?.setItem(SESSION_SEEN, "1");
          } catch {
            /* ignore */
          }
          setPhase("offer");
          requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
          trackEvent("annual_switch_shown", { months_active: d.monthsActive ?? 0 });
        }, DWELL_MS);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [loaded, premium]);

  const dismiss = useCallback(() => {
    hide();
    try {
      window.localStorage.setItem(DISMISS_COUNT, String(readNum(window.localStorage, DISMISS_COUNT) + 1));
      window.localStorage.setItem(SNOOZE_UNTIL, String(Date.now() + SNOOZE_AFTER_DISMISS_MS));
    } catch {
      /* ignore */
    }
    trackEvent("annual_switch_dismissed", {});
  }, [hide]);

  const doSwitch = useCallback(async () => {
    setPhase("working");
    trackEvent("annual_switch_click", {});
    try {
      const res = await fetch("/api/premium/switch-to-annual", { method: "POST" });
      if (!res.ok) {
        setPhase("error");
        return;
      }
      // Prevent it ever re-offering on this browser once they're annual.
      try {
        window.localStorage.setItem(DISMISS_COUNT, String(MAX_DISMISSALS));
      } catch {
        /* ignore */
      }
      trackEvent("annual_switch_success", {});
      invalidateMe(); // entitlement/plan changed — next /api/me reflects it
      setPhase("done");
      setTimeout(() => hide(), 3500);
    } catch {
      setPhase("error");
    }
  }, [hide]);

  // Esc closes the offer (not while a switch is in flight).
  useEffect(() => {
    if (phase !== "offer") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase, dismiss]);

  if (phase === "hidden") return null;

  const savePct = annualSavingPct();

  return (
    <div
      role="region"
      aria-label="Switch to annual Premium"
      className={`fixed bottom-20 left-4 z-[70] w-[calc(100%-2rem)] max-w-sm transition-all duration-300 sm:bottom-4 sm:w-auto ${
        entered ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <div className="relative overflow-hidden rounded-xl border border-gold/40 bg-ink-900 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-ink-800 bg-ink-950/60 px-4 py-2.5">
          <span className="rounded border border-gold/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
            Premium
          </span>
          <span className="text-xs font-semibold text-slate-200">
            {phase === "done" ? "You're on annual 🎉" : "Save on your subscription"}
          </span>
          {phase === "offer" && (
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="ml-auto -mr-1 rounded px-1 text-slate-500 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            >
              ✕
            </button>
          )}
        </div>
        <div className="px-4 py-3">
          {phase === "done" ? (
            <p className="text-xs leading-relaxed text-slate-300">
              Switched — you&apos;re on the annual plan now, at {PREMIUM_ANNUAL_AMOUNT}/yr. Thanks for sticking with
              RiftCompare.
            </p>
          ) : phase === "error" ? (
            <>
              <p className="text-xs leading-relaxed text-rose-300">
                Couldn&apos;t switch your plan automatically. You can change it yourself from the billing portal.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <a
                  href="/premium"
                  className="inline-flex flex-1 items-center justify-center rounded-lg bg-ink-800 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-ink-700"
                >
                  Manage billing →
                </a>
                <button onClick={hide} className="rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 hover:bg-ink-800 hover:text-slate-300">
                  Close
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-slate-400">
                You&apos;re on the monthly plan. Switch to <span className="font-semibold text-slate-200">annual</span> and
                {savePct > 0 ? <> save <span className="font-semibold text-gold">{savePct}%</span> — </> : " pay "}
                <span className="font-semibold text-slate-200">{PREMIUM_ANNUAL_AMOUNT}/yr</span>. You&apos;re billed for the
                year now, with credit for the rest of this month.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={doSwitch}
                  disabled={phase === "working"}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-xs font-bold text-ink-950 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-gold/50 disabled:opacity-60"
                >
                  {phase === "working" ? "Switching…" : "Switch to annual →"}
                </button>
                <button
                  onClick={dismiss}
                  disabled={phase === "working"}
                  className="rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 transition hover:bg-ink-800 hover:text-slate-300 disabled:opacity-60"
                >
                  Not now
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
