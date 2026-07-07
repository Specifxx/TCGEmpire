"use client";

import { useEffect, useState } from "react";
import type { MenuUser } from "@/components/UserMenu";

// Client-side session hook. One /api/me fetch per page load, shared by every
// consumer (NavUser, PremiumProvider) via a module-level promise cache — the
// chrome renders session-less on the server (so pages can be cached/ISR) and
// hydrates the signed-in state from here.
export interface Me {
  user: MenuUser | null;
  premium: boolean;
  premiumCheckout: boolean; // Stripe premium checkout is configured
  trialEligible: boolean; // signed in, not premium, trial on + never trialed
  trialDays: number; // configured free-trial length (0 = trial off)
  premiumAnnual: boolean; // annual plan is configured (Stripe annual price set)
}

const EMPTY_ME: Me = { user: null, premium: false, premiumCheckout: false, trialEligible: false, trialDays: 0, premiumAnnual: false };

let mePromise: Promise<Me> | null = null;

function fetchMe(): Promise<Me> {
  if (!mePromise) {
    mePromise = fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : EMPTY_ME))
      .then((d) => ({
        user: d.user ?? null,
        premium: !!d.premium,
        premiumCheckout: !!d.premiumCheckout,
        trialEligible: !!d.trialEligible,
        trialDays: Number(d.trialDays) || 0,
        premiumAnnual: !!d.premiumAnnual,
      }))
      .catch(() => EMPTY_ME);
  }
  return mePromise;
}

// Re-fetch on next use (e.g. after login/logout navigation re-mounts the chrome).
export function invalidateMe() {
  mePromise = null;
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
