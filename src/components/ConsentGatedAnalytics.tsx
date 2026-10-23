"use client";

import { useEffect } from "react";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/react";
import { useConsent } from "@/lib/use-consent";
import { OPT_OUT_KEY, optOutFromQuery, shouldDropAnalytics } from "@/lib/analytics-filter";

// Vercel Analytics, gated on the SAME consent signal as every
// other tag on the site. The decision logic lives in lib/use-consent.ts so the
// Meta Pixel can't drift onto a different rule — see that file's header.
//
// Analytics needs only the measurement grant, not the advertising one: Vercel
// Analytics is cookieless and does not fingerprint, so TCF purpose 1 is the
// right bar for it. The Meta Pixel asks for the stricter `ad` grant.
//
// beforeSend drops events from localhost, *.vercel.app, headless browsers,
// crawlers and an opted-out owner (lib/analytics-filter.ts; DECISIONS.md
// "Web Analytics drops bots, previews and the owner", 2026-10-23).

function readOptOut(): boolean {
  try {
    return window.localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  if (typeof window === "undefined") return event;
  const drop = shouldDropAnalytics({
    hostname: window.location.hostname,
    userAgent: navigator.userAgent || "",
    webdriver: navigator.webdriver === true,
    optedOut: readOptOut(),
  });
  return drop ? null : event;
}

/** `?notrack=1` on any page opts this browser out of Web Analytics; `?notrack=0` undoes it. */
function OwnerOptOut() {
  useEffect(() => {
    const v = optOutFromQuery(window.location.search);
    if (!v) return;
    try {
      if (v === "1") window.localStorage.setItem(OPT_OUT_KEY, "1");
      else window.localStorage.removeItem(OPT_OUT_KEY);
    } catch {
      /* storage blocked: nothing to remember */
    }
  }, []);
  return null;
}

export function ConsentGatedAnalytics() {
  const { analytics } = useConsent();
  return (
    <>
      <OwnerOptOut />
      {analytics ? <Analytics beforeSend={beforeSend} /> : null}
      {/* Speed Insights was removed on 2026-10-16: billed per event and read by
          no one (DECISIONS.md, "Nothing paid that nobody uses"). */}
    </>
  );
}
