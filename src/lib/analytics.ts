"use client";

import { track as vercelTrack } from "@vercel/analytics";

// Shared custom-event helper — the single place a UI handler fires an event to
// BOTH Vercel Analytics (track()) and GA4 (window.gtag('event', ...)), so the
// two never drift out of sync the way OutboundLink's hand-inlined pair once
// risked. `window.gtag` is declared global in lib/use-consent.ts; calling it
// with `?.` makes this a no-op when GA hasn't loaded (ad blocker, consent
// denied, GA_ENABLED off) rather than throwing.
//
// Params may be `undefined` (e.g. OutboundLink's optional card_id/price/etc.,
// present only at the call sites that already have that data) — stripped
// before either destination sees them, rather than sent through as a literal
// `undefined`, which Vercel Analytics' own type rejects and which would show
// up as a real (if empty) dimension in GA4's event parameter report.
export function trackEvent(name: string, params?: Record<string, string | number | boolean | undefined>): void {
  const cleaned = params
    ? (Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<string, string | number | boolean>)
    : undefined;
  vercelTrack(name, cleaned);
  if (typeof window !== "undefined") window.gtag?.("event", name, cleaned);
}
