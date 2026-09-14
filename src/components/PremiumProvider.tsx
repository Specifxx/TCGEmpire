"use client";

import { createContext, useContext } from "react";
import { useMe } from "@/lib/use-me";

// Whether ads are hidden for the current viewer, read by the ad components so
// they get an ad-free site without each placement doing its own lookup.
//
// Reads `adFree`, NOT `premium`: since 2026-09-14 ad-free is a Premium-tier
// entitlement, and `premium` is still true for Plus. Using the wrong one here
// would silently hand ad-free back to every Plus account.
//
// Resolved CLIENT-SIDE via /api/me: the root layout used to resolve this with
// a server-side getCurrentUser() call, and that cookies() read forced every
// route to render per-request (killing ISR site-wide). Trade-off: ads may
// appear for a moment for Premium members before the session resolves —
// acceptable next to site-wide caching.
const PremiumContext = createContext(false);

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { adFree } = useMe();
  return <PremiumContext.Provider value={adFree}>{children}</PremiumContext.Provider>;
}

export function usePremium(): boolean {
  return useContext(PremiumContext);
}
