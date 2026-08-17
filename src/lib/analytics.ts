"use client";

import { track as vercelTrack } from "@vercel/analytics";

// Shared custom-event helper — the single place a UI handler fires an event to
// BOTH Vercel Analytics (track()) and GA4 (window.gtag('event', ...)), so the
// two never drift out of sync the way OutboundLink's hand-inlined pair once
// risked. `window.gtag` is declared global in lib/use-consent.ts; calling it
// with `?.` makes this a no-op when GA hasn't loaded (ad blocker, consent
// denied, GA_ENABLED off) rather than throwing.
export function trackEvent(name: string, params?: Record<string, string | number | boolean>): void {
  vercelTrack(name, params);
  if (typeof window !== "undefined") window.gtag?.("event", name, params);
}
