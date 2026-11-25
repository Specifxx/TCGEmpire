"use client";

import { useEffect } from "react";
import { REFERRAL_COOKIE } from "@/lib/referral-cookie";
import { inviteCodeFrom } from "@/lib/share-link";
import { captureEntrySource, readCampaign } from "@/lib/entry-source";
import { installPaidVisitTagger } from "@/lib/paid-visit";

// Persists an inbound referral code (?ref=<userId>) into a cookie so it survives
// the browse → sign-up journey and the OAuth round-trip. Read server-side by
// applyReferral() when the new account is created. The code is just a user id
// (non-sensitive), so a plain client cookie is fine. Mounted once in the layout.
export function ReferralCapture() {
  useEffect(() => {
    // The landing's traffic source (Reddit, search, email…) for buy_click
    // attribution — first touch per tab, so it runs before anything returns.
    // See lib/entry-source.ts.
    captureEntrySource();
    readCampaign();
    // A paid ad visit (utm_medium=paid) tags its affiliate clicks, so the earnings
    // dashboard can say what each ad test earned. See lib/paid-visit.ts.
    installPaidVisitTagger();
    // ?ref= (the profile's invite link) or #r= (a member's shared link, 2026-11-18);
    // cuids are lowercase alphanumeric, validated loosely in inviteCodeFrom.
    const ref = inviteCodeFrom(window.location.search, window.location.hash);
    if (!ref) return;
    document.cookie = `${REFERRAL_COOKIE}=${encodeURIComponent(ref)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
  }, []);
  return null;
}
