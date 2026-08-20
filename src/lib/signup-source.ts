"use client";

import { trackEvent } from "./analytics";
import { SIGNUP_SOURCE_COOKIE, parseSignupSource } from "./signup-source-shared";

// The one choke point every sign-in CTA calls on click — same pattern as
// region_changed firing only from CountryProvider.setCountry(), so "how many
// people clicked a sign-in button, from where" is a single event name with a
// source param rather than a per-surface zoo of names.
//
// Two things happen per click:
//  1. sign_in_click fires (GA4 + Vercel via trackEvent) with the source.
//  2. A short-lived cookie records the source, so if the visitor completes
//     OAuth the callback can stamp User.signupSource — attribution that
//     survives the third-party round trip, which client analytics can't cross.
//
// 30 minutes, not a session: long enough to cover a slow OAuth consent +
// account-picker dance, short enough that a click today doesn't claim credit
// for a signup next week. Not httpOnly (set from JS by design); the server
// side whitelists the value before persisting, so tampering buys nothing.
export function markSignupSource(source: string): void {
  const safe = parseSignupSource(source) ?? "other";
  trackEvent("sign_in_click", { source: safe });
  try {
    document.cookie = `${SIGNUP_SOURCE_COOKIE}=${safe}; path=/; max-age=1800; samesite=lax`;
  } catch {
    /* non-browser / privacy mode — the click event above already fired */
  }
}
