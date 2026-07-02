"use client";

import { createContext, useContext } from "react";
import { useMe } from "@/lib/use-me";

// Whether the current viewer has an active Premium subscription, read by the
// ad components so Premium members get an ad-free site without each placement
// doing its own lookup.
//
// Resolved CLIENT-SIDE via /api/me: the root layout used to resolve this with
// a server-side getCurrentUser() call, and that cookies() read forced every
// route to render per-request (killing ISR site-wide). Trade-off: ads may
// appear for a moment for Premium members before the session resolves —
// acceptable next to site-wide caching.
const PremiumContext = createContext(false);

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { premium } = useMe();
  return <PremiumContext.Provider value={premium}>{children}</PremiumContext.Provider>;
}

export function usePremium(): boolean {
  return useContext(PremiumContext);
}
