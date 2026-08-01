"use client";

import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

// ─────────────────────────────────────────────────────────────────────────────
// Vercel Analytics / Speed Insights, gated on the SAME consent signal as ads.
// ─────────────────────────────────────────────────────────────────────────────
// Consent Mode v2 defaults every signal to denied (see ConsentDefaults). Google's
// tags read that themselves; Vercel's don't, so this wires them to the same
// decision rather than leaving one measurement vendor outside the consent model.
//
// How the decision is made, in order:
//   • Google's Privacy & Messaging message is a TCF v2.2 CMP, so it exposes
//     window.__tcfapi. If it's there, we listen: analytics runs once the visitor
//     has consented (or once the CMP reports GDPR doesn't apply to them).
//   • If no CMP has appeared after a short grace period, this visitor is outside
//     the EEA/UK/CH — no message is shown to them at all, and analytics runs.
//     (Vercel Analytics is cookieless and doesn't fingerprint, which is why
//     "no applicable consent regime" is a sufficient basis here.)
//
// Failing OPEN outside the CMP's scope, and CLOSED inside it, is the same shape
// Google's own region-scoped consent defaults use.
//
// TCF purpose 1 is "Store and/or access information on a device" — the purpose
// any measurement script needs. We check it rather than vendor consent because
// Vercel is not a TCF vendor.
const CMP_GRACE_MS = 2500;

type TcfListener = (tcData: TcData, success: boolean) => void;
type TcData = {
  gdprApplies?: boolean;
  eventStatus?: string;
  purpose?: { consents?: Record<string, boolean> };
};
type TcfApi = (
  command: string,
  version: number,
  callback: TcfListener,
  parameter?: unknown,
) => void;

declare global {
  interface Window {
    __tcfapi?: TcfApi;
    __rcConsent?: { ad: boolean; analytics: boolean };
  }
}

export function ConsentGatedAnalytics() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let settled = false;
    let listenerId: unknown;

    const grant = () => {
      if (settled) return;
      settled = true;
      if (window.__rcConsent) window.__rcConsent.analytics = true;
      setAllowed(true);
    };

    const attach = () => {
      const api = window.__tcfapi;
      if (!api) return false;
      api("addEventListener", 2, (tcData, success) => {
        if (!success || !tcData) return;
        // Outside the GDPR's scope — the message never shows for this visitor.
        if (tcData.gdprApplies === false) return grant();
        if (tcData.eventStatus !== "useractioncomplete" && tcData.eventStatus !== "tcloaded") return;
        if (tcData.purpose?.consents?.["1"]) grant();
      });
      return true;
    };

    if (attach()) return;

    // The CMP arrives with adsbygoogle.js, so poll briefly before concluding
    // there isn't one. Whichever happens first wins; both paths are idempotent.
    const started = Date.now();
    const poll = window.setInterval(() => {
      if (settled) return window.clearInterval(poll);
      if (attach()) return window.clearInterval(poll);
      if (Date.now() - started >= CMP_GRACE_MS) {
        window.clearInterval(poll);
        grant(); // no CMP on the page ⇒ visitor is outside its scope
      }
    }, 250);

    return () => {
      window.clearInterval(poll);
      void listenerId;
    };
  }, []);

  if (!allowed) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
