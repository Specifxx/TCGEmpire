import type { Metadata } from "next";

// ─────────────────────────────────────────────────────────────────────────────
// Metadata for a dynamic route whose param doesn't resolve.
// ─────────────────────────────────────────────────────────────────────────────
// A route like /sets/nonexistent-page-test used to inherit the root layout's
// title verbatim — "RiftCompare — Riftbound Card Database & Price Comparison" —
// so an error page advertised itself in search results as the homepage.
//
// WHERE THIS ACTUALLY TAKES EFFECT: `src/app/not-found.tsx`, which exports
// `metadata = notFoundMetadata()`. That is the only place that changes what a
// 404 response renders — measured against a running production server. A
// `notFound()` thrown from a page DISCARDS that route's own generateMetadata
// result, so the per-route calls below cannot set the 404's title. (This file's
// first version assumed the opposite, and the check that was supposed to prove
// it was comparing an HTML-escaped title against an unescaped one, so it passed
// while the bug was still live. Both are fixed; scripts/status-check.ts now
// decodes entities before comparing.)
//
// The per-route generateMetadata calls are kept anyway, as a fence: if a future
// page ever renders a "nothing here" state WITHOUT calling notFound(), its
// metadata still carries noindex instead of the homepage's title. They are
// defence in depth, not the mechanism.
//
// index:false, follow:false — nothing on a 404 is worth following. Note this is
// the one deliberate exception to the project rule of de-indexing with
// `follow: true`: that rule protects link equity on real pages that are merely
// hidden from the index, and a 404 has none to protect. robots.txt is untouched
// either way — the AdSense crawler must be able to fetch every URL.
export function notFoundMetadata(what = "Page"): Metadata {
  return {
    title: { absolute: `${what} not found — RiftCompare` },
    description:
      "We couldn't find that page. Search the Riftbound card database for live prices across stores in Australia, the US, the UK, Singapore, Canada and Germany.",
    robots: { index: false, follow: false },
  };
}
