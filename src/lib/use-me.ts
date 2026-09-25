"use client";

import { useEffect, useState } from "react";
import type { MenuUser } from "@/components/UserMenu";

// Client-side session hook. One /api/me fetch per page load, shared by every
// consumer (NavUser, PremiumProvider) via a module-level promise cache — the
// chrome renders session-less on the server (so pages can be cached/ISR) and
// hydrates the signed-in state from here.
export interface Me {
  user: MenuUser | null;
  // Opaque GA4 User-ID for the signed-in account, or null when signed out.
  // Deliberately NOT part of MenuUser: it is a measurement identifier, not
  // profile data, and nothing that renders the account chrome should read it.
  analyticsId: string | null;
  premium: boolean;
  // Ads hidden for this viewer — every paid tier, Plus included (2026-09-25).
  // Still its own flag rather than `premium`, so the line can move again
  // without touching every ad placement.
  adFree: boolean;
  tier: "plus" | "premium" | null; // which paid tier, or null if not entitled
  // A paying viewer still inside the free trial: plan switches (Plus →
  // Premium) aren't offered, because the switch routes handle paid
  // subscriptions only. Always false for free and signed-out viewers.
  trialing: boolean;
  // The paying viewer's billing interval, so an upgrade quotes the price it
  // will actually charge (annual stays annual). null when unknown/unpaid.
  interval: "month" | "year" | null;
  premiumCheckout: boolean; // Stripe premium checkout is configured
  premiumPlus: boolean; // the cheaper Plus tier is configured (Stripe Plus price set)
  trialEligible: boolean; // signed in, not premium, trial on + never trialed
  trialDays: number; // configured free-trial length (0 = trial off)
  introEligible: boolean; // checkout would attach the half-price intro (monthly)
  premiumAnnual: boolean; // annual plan is configured (Stripe annual price set)
  plusAnnual: boolean; // Plus's own annual plan is configured
  // Which OAuth sign-in buttons are configured — for client components that
  // render AuthForm themselves (PremiumDialog's signed-out state).
  providers: ("google" | "discord")[];
}

const EMPTY_ME: Me = {
  user: null,
  analyticsId: null,
  premium: false,
  adFree: false,
  tier: null,
  trialing: false,
  interval: null,
  premiumCheckout: false,
  premiumPlus: false,
  trialEligible: false,
  trialDays: 0,
  introEligible: false,
  premiumAnnual: false,
  plusAnnual: false,
  providers: [],
};

let mePromise: Promise<Me> | null = null;

// Exported for use-watchlist.ts, which gates on this shared session instead of
// making its own request (an anonymous visitor then makes no watchlist call).
export function fetchMe(): Promise<Me> {
  if (!mePromise) {
    mePromise = fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : EMPTY_ME))
      .then((d) => ({
        user: d.user ?? null,
        analyticsId: typeof d.analyticsId === "string" ? d.analyticsId : null,
        premium: !!d.premium,
        adFree: !!d.adFree,
        tier: d.tier === "plus" || d.tier === "premium" ? d.tier : null,
        trialing: !!d.trialing,
        interval: d.interval === "month" || d.interval === "year" ? d.interval : null,
        premiumCheckout: !!d.premiumCheckout,
        premiumPlus: !!d.premiumPlus,
        trialEligible: !!d.trialEligible,
        trialDays: Number(d.trialDays) || 0,
        introEligible: !!d.introEligible,
        premiumAnnual: !!d.premiumAnnual,
        plusAnnual: !!d.plusAnnual,
        // Narrowed to the two known providers so a malformed payload can never
        // put an arbitrary string into an OAuth href.
        providers: (Array.isArray(d.providers) ? d.providers : []).filter(
          (p: unknown): p is "google" | "discord" => p === "google" || p === "discord"
        ),
      }))
      .catch(() => EMPTY_ME);
  }
  return mePromise;
}

// Announced on window whenever the session may have changed in place (a
// purchase activating, a tier switch) — for listeners that can't simply re-run
// on the next render, such as NativeShell's native AdMob banner, which must
// come down the moment the viewer becomes ad-free.
export const ME_INVALIDATED_EVENT = "rc:me-invalidated";

// Re-fetch on next use (e.g. after login/logout navigation re-mounts the chrome).
export function invalidateMe() {
  mePromise = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ME_INVALIDATED_EVENT));
}

export function useMe(): Me & { loaded: boolean } {
  const [state, setState] = useState<Me & { loaded: boolean }>({ ...EMPTY_ME, loaded: false });

  useEffect(() => {
    let cancelled = false;
    fetchMe().then((me) => {
      if (!cancelled) setState({ ...me, loaded: true });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
