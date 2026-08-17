"use client";

import { useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// One consent signal, shared by every measurement tag.
// ─────────────────────────────────────────────────────────────────────────────
// Consent Mode v2 defaults every signal to denied (see components/
// ConsentDefaults.tsx). EVERY vendor has to be told when that changes — Google's
// tags included. They read the DEFAULT state on their own, which is easy to
// misread as them tracking this decision too; they do not. A gtag('consent',
// 'update') is the only thing that moves them off the default, so grant() below
// pushes one. Non-Google vendors (Vercel Analytics) read the returned state.
//
// Getting that wrong is not a subtle failure: until the update call was added,
// the site asked for consent, decided the visitor could be measured, honoured it
// for Vercel, and left GA4 on the denied default — so GA4 saw only cookieless
// consent-denied pings for all traffic and reported zero users indefinitely.
//
// How the decision is made, in order:
//   • Google's Privacy & Messaging message is a TCF v2.2 CMP, so it exposes
//     window.__tcfapi. If it's there, we listen: granted once the visitor has
//     consented to TCF purpose 1 ("store and/or access information on a
//     device") — the purpose any measurement script needs — or once the CMP
//     reports that the GDPR doesn't apply to this visitor.
//   • If no CMP has appeared after a short grace period, this visitor is outside
//     the EEA/UK/CH and no message is shown to them at all, so measurement runs.
//
// Failing OPEN outside the CMP's scope and CLOSED inside it is the same shape as
// Google's own region-scoped consent defaults.

// Exported so ConsentDefaults.tsx's wait_for_update (a plain template string,
// not code that can import across the "use client" boundary this module sits
// behind) can be asserted numerically >= this value by a test instead of only
// by a comment.
export const CMP_GRACE_MS = 2500;

type TcData = {
  gdprApplies?: boolean;
  eventStatus?: string;
  purpose?: { consents?: Record<string, boolean> };
};
type TcfApi = (
  command: string,
  version: number,
  callback: (tcData: TcData, success: boolean) => void,
  parameter?: unknown,
) => void;

declare global {
  interface Window {
    __tcfapi?: TcfApi;
    __rcConsent?: { analytics: boolean };
    // Defined by components/ConsentDefaults.tsx as an inline <head> script, so it
    // exists before any React code runs. Optional anyway: if that script were ever
    // removed, the optional call below no-ops instead of throwing.
    gtag?: (...args: unknown[]) => void;
  }
}

export type ConsentState = {
  /** Measurement (analytics) may run. */
  analytics: boolean;
  /** A CMP was detected, i.e. this visitor is in a consent regime. */
  cmpPresent: boolean;
};

// MODULE-level, not per-hook-instance: useConsent() is called from more than one
// component on the same page (ConsentGatedAnalytics, GoogleAnalyticsUser), each
// mounting its own effect with its own `settled` closure. Without a guard shared
// across all of them, every mounted instance that resolves pushes its own
// `gtag('consent','update', ...)` — the duplicate visible in the live dataLayer
// trace. This only needs to gate the ONE thing Google's tags must hear once per
// page; each instance's own React state below is untouched, so per-component
// gating (e.g. GoogleAnalyticsUser withholding user_id) keeps working.
let pushedConsentUpdate = false;

export function useConsent(): ConsentState {
  const [state, setState] = useState<ConsentState>({ analytics: false, cmpPresent: false });

  useEffect(() => {
    let settled = false;

    const grant = (cmpPresent: boolean) => {
      if (settled) return;
      settled = true;
      // Tell GOOGLE'S tags, not just our own flag. Consent Mode defaults every
      // signal to denied (ConsentDefaults.tsx) and Google's tags never learn
      // about the decision made here unless it is pushed to them explicitly —
      // without this line the grant reached Vercel Analytics only, and GA4
      // received nothing but cookieless consent-denied pings for 100% of
      // traffic, worldwide, forever.
      //
      // ONLY analytics_storage moves. A consent 'update' is a partial merge, so
      // the three advertising signals keep the denied value set by the default;
      // they stay denied until the AdSense review completes. Do not add them
      // here — widening this object is an advertising-policy change, not a
      // measurement fix.
      if (!pushedConsentUpdate) {
        pushedConsentUpdate = true;
        window.gtag?.("consent", "update", { analytics_storage: "granted" });
      }
      if (window.__rcConsent) window.__rcConsent.analytics = true;
      setState({ analytics: true, cmpPresent });
    };

    const attach = () => {
      const api = window.__tcfapi;
      if (!api) return false;
      setState((s) => ({ ...s, cmpPresent: true }));
      api("addEventListener", 2, (tcData, success) => {
        if (!success || !tcData) return;
        // Outside the GDPR's scope — the message never shows for this visitor.
        if (tcData.gdprApplies === false) return grant(true);
        if (tcData.eventStatus !== "useractioncomplete" && tcData.eventStatus !== "tcloaded") return;
        // Purpose 1: store/access information — the one any measurement script needs.
        if (tcData.purpose?.consents?.["1"]) grant(true);
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
        grant(false); // no CMP ⇒ visitor is outside its scope
      }
    }, 250);

    return () => window.clearInterval(poll);
  }, []);

  return state;
}
