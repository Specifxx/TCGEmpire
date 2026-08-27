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
// Events that go to GA4 ONLY, never to Vercel Analytics.
//
// Vercel bills custom events against a monthly quota, so a single high-volume
// event can crowd out every low-volume one that actually drives decisions.
// signup_promo_shown is an IMPRESSION — it fires for a large share of visitors
// (26% at its peak, the site's #1 event by volume), and _dismissed tracks it
// closely. Between them they were consuming the allowance that buy_click,
// sign_up and price_alert_subscribed need, and those are the events worth
// paying for: a handful of them a day decide whether the site works.
//
// They are NOT deleted — GA4 still receives both, with the `variant` property,
// so the popup's shown → dismissed → sign_up funnel and the comparison-vs-perks
// layout test remain fully measurable. GA4 has no per-event billing, which
// makes it the right home for a high-cardinality impression.
//
// Add to this set rather than dropping a trackEvent() call: keeping the call
// site intact is what keeps the two destinations from silently diverging, which
// is the whole reason this dispatcher exists.
//
// premium_slidein_shown/_dismissed are the same shape as the signup pair: an
// impression that fires for a share of logged-in visitors, plus its close
// companion. They go to GA4 only for the same billing reason. The valuable low-
// volume leg — premium_slidein_click — is deliberately NOT here, so it still
// reaches Vercel alongside buy_click and sign_up.
const GA4_ONLY_EVENTS = new Set([
  "signup_promo_shown",
  "signup_promo_dismissed",
  "premium_slidein_shown",
  "premium_slidein_dismissed",
]);

export function trackEvent(name: string, params?: Record<string, string | number | boolean | undefined>): void {
  const cleaned = params
    ? (Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<string, string | number | boolean>)
    : undefined;
  if (!GA4_ONLY_EVENTS.has(name)) vercelTrack(name, cleaned);
  if (typeof window !== "undefined") window.gtag?.("event", name, cleaned);
}
