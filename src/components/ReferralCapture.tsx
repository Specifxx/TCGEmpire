"use client";

import { useEffect } from "react";
import { REFERRAL_COOKIE } from "@/lib/referral-cookie";

// Persists an inbound referral code (?ref=<userId>) into a cookie so it survives
// the browse → sign-up journey and the OAuth round-trip. Read server-side by
// applyReferral() when the new account is created. The code is just a user id
// (non-sensitive), so a plain client cookie is fine. Mounted once in the layout.
export function ReferralCapture() {
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    // cuids are lowercase alphanumeric; validate loosely before storing.
    if (!ref || !/^[a-z0-9]{6,40}$/i.test(ref)) return;
    document.cookie = `${REFERRAL_COOKIE}=${encodeURIComponent(ref)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
  }, []);
  return null;
}
