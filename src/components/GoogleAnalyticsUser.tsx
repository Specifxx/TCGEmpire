"use client";

import { useEffect, useRef } from "react";
import { useMe } from "@/lib/use-me";
import { useConsent } from "@/lib/use-consent";
import { GA_ENABLED } from "@/lib/ga";

// GA4 User-ID — ties sessions on different devices back to one account.
// https://support.google.com/analytics/answer/9213390
//
// The value is an opaque digest computed server-side (lib/ga-user-id.ts) and
// delivered by /api/me. NOTHING identifying is sent: not the email, not the
// display name, not the account's row id. Do not "improve" this by passing
// anything human-readable — Google's terms prohibit sending PII to Analytics,
// and an email in user_id is the single most common way sites breach them.
//
// GATED ON CONSENT, deliberately. user_id is a persistent identifier for a
// person, so it is held until the same signal that unblocks measurement at all
// (lib/use-consent.ts, read-only here). A visitor inside the CMP's scope who has
// not consented is measured cookielessly and anonymously, and stays that way.
//
// CLEARING ON SIGN-OUT is belt-and-braces. Both sign-out paths today
// (UserMenu.signOut, ProfileActions.LogoutButton) finish with
// window.location.assign("/"), and a full document load discards the gtag state
// with everything else — so the id cannot currently survive a sign-out. That is
// a property of those two call sites, not a guarantee of this component, and
// swapping either to a client-side router push would silently start attributing
// the next visitor on that browser to the account that just left. The explicit
// null below means that change stays harmless.
//
// TIMING: /api/me is fetched after mount, so the first page_view of a session
// goes out before the id is known. GA4 handles this — user_id attaches to every
// subsequent event and the session is stitched on Google's side — but it does
// mean the very first hit of a brand-new session is unattributed.
export function GoogleAnalyticsUser() {
  const { analyticsId, loaded } = useMe();
  const { analytics: consented } = useConsent();
  // gtag('set') is global and sticky; re-sending an unchanged value each render
  // is pointless traffic. Track what was last pushed and only write on change.
  const lastSent = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!GA_ENABLED || !loaded) return;
    // Withhold the identifier until consent, but do NOT return early once it has
    // been sent — see the clear below, which must still run if consent is absent.
    const next = consented ? analyticsId : null;
    if (lastSent.current === next) return;
    lastSent.current = next;
    // `null` (not undefined, not "") is what unsets a previously-set field.
    window.gtag?.("set", { user_id: next });
  }, [analyticsId, consented, loaded]);

  return null;
}
