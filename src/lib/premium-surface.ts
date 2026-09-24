// WHICH SURFACE SENT SOMEONE TO PREMIUM — one vocabulary for the click beacon,
// the checkout route and the funnel report.
//
// Why this exists (DECISIONS.md, "Premium after sign-up: the post-signup
// funnel", 2026-09-23): the slide-in and every navbar/menu Premium link both
// logged source "button", and every tool gate logged "dialog", so the funnel
// report could say how many Premium clicks there were but never which surface
// produced them — and so never whether the slide-in works. A click now records
// its surface; the surface rides into checkout (sessionStorage, then the
// request body's `surface` field); and checkout stamps it on the PremiumClick
// row AND the Stripe subscription's metadata, so a trial can be traced back to
// the surface that started it.
//
// Client-safe: no server imports. The route validates with isPremiumClickSource
// before anything reaches the database, so a crafted body cannot write
// arbitrary strings.

// Fixed sources. The first six predate this file and stay valid so historic
// rows keep their meaning: "button" = the slide-in OR a nav link before
// 2026-09-23, "dialog" = a tool gate before 2026-09-23.
const FIXED = new Set([
  "dialog",
  "checkout",
  "premium-page",
  "button",
  "recovery",
  "offer",
  "slidein",
  "checklist",
  "welcome-email",
]);

// Scoped surfaces: `nav:navbar`, `gate:deal-finder`, `nudge:watchlist` … The
// suffix names the place; the prefix is the kind of surface.
const SCOPED = /^(nav|gate|nudge):[a-z0-9-]{1,32}$/;

export function isPremiumClickSource(v: unknown): v is string {
  return typeof v === "string" && (FIXED.has(v) || SCOPED.test(v));
}

// Sources that are NOT a surface: they are steps of the purchase itself (or the
// generic fallback), so they must never overwrite the surface that sent the
// visitor there. Someone who clicks the slide-in, lands on /premium and presses
// its buy button was sent by the slide-in, not by "premium-page".
const NOT_A_SURFACE = new Set(["checkout", "premium-page", "dialog", "button"]);

export function isPremiumSurface(v: unknown): v is string {
  return isPremiumClickSource(v) && !NOT_A_SURFACE.has(v);
}

const SURFACE_KEY = "rc_premium_surface";

/** Remember the surface for the rest of this tab's session (survives the OAuth round trip). */
export function rememberPremiumSurface(surface: string): void {
  if (!isPremiumSurface(surface)) return;
  try {
    window.sessionStorage.setItem(SURFACE_KEY, surface);
  } catch {
    /* private mode / storage disabled — attribution is best-effort */
  }
}

/** The last surface this tab clicked, or null. Validated on the way out too. */
export function recallPremiumSurface(): string | null {
  try {
    const v = window.sessionStorage.getItem(SURFACE_KEY);
    return isPremiumSurface(v) ? v : null;
  } catch {
    return null;
  }
}
