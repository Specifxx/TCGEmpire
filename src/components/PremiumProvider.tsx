"use client";

import { createContext, useContext } from "react";
import { useMe } from "@/lib/use-me";

// Whether ads are hidden for the current viewer, read by the ad components so
// they get an ad-free site without each placement doing its own lookup.
//
// Reads `adFree`, NOT `premium`. Today they agree — every paid tier, Plus
// included, is ad-free (2026-09-25; it was Premium-only from 2026-09-14) — but
// they are separate questions on purpose, so the ad-free line can move again
// in /api/me alone without touching this provider or any ad placement.
//
// Resolved CLIENT-SIDE via /api/me: the root layout used to resolve this with
// a server-side getCurrentUser() call, and that cookies() read forced every
// route to render per-request (killing ISR site-wide). Trade-off: ads may
// appear for a moment for paying members before the session resolves —
// acceptable next to site-wide caching.
const PremiumContext = createContext(false);

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { adFree } = useMe();
  return <PremiumContext.Provider value={adFree}>{children}</PremiumContext.Provider>;
}

export function usePremium(): boolean {
  return useContext(PremiumContext);
}
