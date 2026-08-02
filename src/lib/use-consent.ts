"use client";

import { useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// One consent signal, shared by every measurement and advertising tag.
// ─────────────────────────────────────────────────────────────────────────────
// Consent Mode v2 defaults every signal to denied (see components/
// ConsentDefaults.tsx). Google's own tags read that state themselves; anything
// that isn't a Google tag — Vercel Analytics, the Meta Pixel — has to be wired
// to the same decision explicitly, or the site is asking for consent and then
// ignoring the answer for half its vendors.
//
// This hook was extracted from ConsentGatedAnalytics precisely so the Meta Pixel
// could not end up on a second, subtly different rule. One implementation, one
// set of semantics, two consumers.
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
//
// The Meta Pixel is deliberately held to the STRICTER of the two: it sets
// third-party advertising cookies, so it additionally requires that the visitor
// has not been left on the denied default (`window.__rcConsent.ad`).

const CMP_GRACE_MS = 2500;

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
    __rcConsent?: { ad: boolean; analytics: boolean };
  }
}

export type ConsentState = {
  /** Measurement (analytics) may run. */
  analytics: boolean;
  /** Advertising / cross-site tracking may run — strictly narrower. */
  ad: boolean;
  /** A CMP was detected, i.e. this visitor is in a consent regime. */
  cmpPresent: boolean;
};

export function useConsent(): ConsentState {
  const [state, setState] = useState<ConsentState>({ analytics: false, ad: false, cmpPresent: false });

  useEffect(() => {
    let settled = false;

    const grant = (ad: boolean, cmpPresent: boolean) => {
      if (settled) return;
      settled = true;
      if (window.__rcConsent) {
        window.__rcConsent.analytics = true;
        window.__rcConsent.ad = ad;
      }
      setState({ analytics: true, ad, cmpPresent });
    };

    const attach = () => {
      const api = window.__tcfapi;
      if (!api) return false;
      setState((s) => ({ ...s, cmpPresent: true }));
      api("addEventListener", 2, (tcData, success) => {
        if (!success || !tcData) return;
        // Outside the GDPR's scope — the message never shows for this visitor.
        if (tcData.gdprApplies === false) return grant(true, true);
        if (tcData.eventStatus !== "useractioncomplete" && tcData.eventStatus !== "tcloaded") return;
        const p = tcData.purpose?.consents ?? {};
        // Purpose 1: store/access information. Purposes 3+4: ad personalisation
        // and selection — the ones an advertising pixel actually needs.
        if (p["1"]) grant(Boolean(p["3"] && p["4"]), true);
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
        grant(true, false); // no CMP ⇒ visitor is outside its scope
      }
    }, 250);

    return () => window.clearInterval(poll);
  }, []);

  return state;
}
