"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/use-me";
import { trackEvent } from "@/lib/analytics";
import { PREMIUM_SLIDER_DELAY_MS, PREMIUM_SLIDER_SNOOZE_MS } from "@/lib/nudge-timing";
import { premiumSliderEligible } from "@/lib/nudge-gate";
import { armNudge } from "@/lib/nudge-runtime";
import { isSignupSession } from "@/lib/signup-session";

// THE PRICING CALLOUT (2026-10-25, owner: "the premium slide is not working …
// get rid of the slider … create a little cool animation with an arrow pointing
// to the pricing after a couple of seconds delay, 'try our premium features'").
// DECISIONS.md, "/premium is one plan table and one comparison". Replaces the
// corner card (PremiumSlideIn): instead of a second sales surface, it points at
// the one that exists, the header's Pricing link.
//
// Rendered INSIDE that link (GetPremiumLink's `nudge`), absolutely positioned
// under it, so the whole callout is the link: a tap goes to /premium. The ✕ only
// dismisses. Shown to anyone who is not on Premium, once per browser session,
// PREMIUM_SLIDER_DELAY_MS (3 s) after the page settles, gone again after 9 s;
// a dismissal snoozes it for PREMIUM_SLIDER_SNOOZE_MS (3 days). The skip list is
// the slider's own gate (premiumSliderEligible: never on /premium, sign-in,
// admin, games, embeds). Client-only, so a crawler never sees it.

const SESSION_KEY = "rc_pricing_nudge_seen";
const SNOOZE_KEY = "rc_pricing_nudge_snooze";
const VISIBLE_MS = 9_000;

function read(store: "local" | "session", key: string): string | null {
  try {
    return (store === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
function write(store: "local" | "session", key: string, value: string): void {
  try {
    (store === "local" ? window.localStorage : window.sessionStorage).setItem(key, value);
  } catch {
    /* private mode: the callout just shows again next session */
  }
}

export function PricingNudge() {
  const { loaded, tier, premiumCheckout } = useMe();
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  // An empty marker inside the link, so the callout can tell whether ITS header
  // copy is on screen: the phone and desktop links both mount, one display:none.
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!loaded || tier === "premium" || !premiumCheckout) return;
    if (!premiumSliderEligible({ pathname })) return;
    if (read("session", SESSION_KEY)) return;
    // Someone who has just signed up is shown around, not sold to.
    if (isSignupSession()) return;
    const snoozed = Number(read("local", SNOOZE_KEY) ?? 0);
    if (snoozed && Date.now() - snoozed < PREMIUM_SLIDER_SNOOZE_MS) return;
    let hide: ReturnType<typeof setTimeout> | undefined;
    // The shared show timer: it also waits while a dialog is open or a text
    // field has focus, and stops for good on navigation (lib/nudge-runtime.ts).
    const stop = armNudge({
      delayMs: PREMIUM_SLIDER_DELAY_MS,
      onFire: () => {
        // Two header instances (phone and desktop) mount together. Only the one
        // actually laid out may fire; it claims the session for both.
        if (!anchor.current || anchor.current.getClientRects().length === 0) return;
        if (read("session", SESSION_KEY)) return;
        write("session", SESSION_KEY, "1");
        setShow(true);
        trackEvent("pricing_nudge_view");
        hide = setTimeout(() => setShow(false), VISIBLE_MS);
      },
    });
    return () => {
      stop();
      if (hide) clearTimeout(hide);
    };
  }, [loaded, tier, premiumCheckout, pathname]);

  const dismiss = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    write("local", SNOOZE_KEY, String(Date.now()));
    setShow(false);
    trackEvent("pricing_nudge_dismiss");
  };

  // Escape closes it, unless a dialog is open (that Escape belongs to the dialog).
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.body.dataset.rcDialog !== "1") setShow(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show]);

  if (!show) return <span ref={anchor} aria-hidden className="pointer-events-none absolute h-0 w-0" />;
  // Centred under the link by an outer span (its translate would fight the
  // entrance animation's transform), so it fits whether the link sits at the
  // left of a phone header or the right of a desktop one.
  return (
    <span ref={anchor} className="absolute left-1/2 top-full z-[70] mt-3 block w-56 -translate-x-1/2">
    <span
      role="status"
      onClick={() => trackEvent("pricing_nudge_click")}
      className="pricing-nudge relative block cursor-pointer whitespace-normal rounded-xl border border-gold/50 bg-ink-900 py-3 pl-3.5 pr-8 text-left font-normal normal-case tracking-normal shadow-2xl shadow-black/50"
      data-pricing-nudge
    >
      {/* The arrow, bobbing up at the Pricing link (centred by its own wrapper, for the same reason). */}
      <span aria-hidden className="absolute -top-5 left-1/2 block -translate-x-1/2">
        <span className="pricing-nudge-arrow block text-xl leading-none text-gold">▲</span>
      </span>
      <span className="block text-sm font-extrabold text-white">✦ Try our Premium features</span>
      <span className="mt-0.5 block text-xs font-medium leading-snug text-slate-300">Unlimited Best Basket, bulk pricing, price alerts and no ads. See the plans →</span>
      {/* A span, not a <button>: the callout sits inside the Pricing link, and
          interactive content can't nest in an <a>. */}
      <span
        role="button"
        tabIndex={0}
        aria-label="Dismiss"
        onClick={dismiss}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") dismiss(e);
        }}
        className="absolute -right-1 -top-1 grid min-h-11 min-w-11 place-items-center rounded-full text-xs text-slate-400 hover:text-white"
      >
        ✕
      </span>
    </span>
    </span>
  );
}
