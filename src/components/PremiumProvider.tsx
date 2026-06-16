"use client";

import { createContext, useContext } from "react";

// Whether the current viewer has an active Premium subscription. Set once by the
// root layout (server-resolved) and read by the ad components so Premium members
// get an ad-free site without each ad placement doing its own lookup.
const PremiumContext = createContext(false);

export function PremiumProvider({ value, children }: { value: boolean; children: React.ReactNode }) {
  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

export function usePremium(): boolean {
  return useContext(PremiumContext);
}
