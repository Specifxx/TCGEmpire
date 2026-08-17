// Small shared helper for pushing custom GA4 events through gtag().
//
// This does NOT duplicate consent handling. `window.gtag` is defined by the
// inline script in components/ConsentDefaults.tsx as the very first thing in
// <head> (before GA4's real script tag even loads), and every call it queues
// is subject to Consent Mode v2's default `analytics_storage: 'denied'` until
// lib/use-consent.ts's grant() pushes a `gtag('consent','update', …)` — see
// that file's header for the full mechanism. So gating a custom event here on
// nothing more than "does gtag exist" is enough: an unconsented visitor still
// has every call below queued into dataLayer exactly like GA4's own automatic
// events (page_view, scroll, etc.), and Google's tag itself decides whether
// anything is actually sent based on the consent signal — this file has no
// consent decision of its own to get wrong.
//
// The `typeof window.gtag === "function"` guard exists for three real cases,
// none of which are about consent: (1) GA_ENABLED is false (NEXT_PUBLIC_GA_ID
// unset to "off"), in which case GoogleAnalytics.tsx never renders the real
// script but ConsentDefaults' inline gtag() shim still exists — calls are
// harmless no-ops into an array nobody reads; (2) this code running in a
// context where ConsentDefaults never rendered at all (shouldn't happen in
// this app, but the guard costs nothing); (3) an ad/tracker blocker that
// deletes window.gtag outright rather than just leaving it a no-op.
export function gaEvent(name: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}
