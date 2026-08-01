"use client";

import { useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// "Privacy settings" — re-opens Google's Privacy & Messaging consent message.
// ─────────────────────────────────────────────────────────────────────────────
// A published GDPR message is only compliant if the visitor can CHANGE their
// mind later, so a persistent control has to live somewhere permanent — here,
// the site footer. This uses Google's documented Funding Choices API rather than
// a hand-rolled dialog:
//
//   googlefc.callbackQueue.push({ CONSENT_DATA_READY: cb })  — the ready hook
//   googlefc.showRevocationMessage()                          — re-opens it
//
// The button renders NOTHING until googlefc confirms the message applies to this
// visitor. Outside the EEA/UK/CH there is no message to re-open, so a dead
// "Privacy settings" link would be worse than none. Rendering nothing also means
// no server/client markup divergence to reason about — it starts hidden on both.
type GoogleFc = {
  callbackQueue?: { push: (cb: Record<string, () => void>) => void };
  showRevocationMessage?: () => void;
  getConsentStatus?: () => unknown;
};

declare global {
  interface Window {
    googlefc?: GoogleFc;
  }
}

const POLL_MS = 500;
const GIVE_UP_MS = 15000;

export function PrivacySettingsLink({ className }: { className?: string }) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let done = false;
    const started = Date.now();

    const register = () => {
      const fc = window.googlefc;
      if (!fc) return false;
      // Documented shape: the queue is drained once consent data is available.
      fc.callbackQueue = fc.callbackQueue ?? [] as unknown as GoogleFc["callbackQueue"];
      fc.callbackQueue?.push({
        CONSENT_DATA_READY: () => {
          if (!done && typeof window.googlefc?.showRevocationMessage === "function") {
            done = true;
            setAvailable(true);
          }
        },
      });
      return true;
    };

    if (register()) return;

    // googlefc is created by adsbygoogle.js, which loads async — poll for it.
    const poll = window.setInterval(() => {
      if (done || Date.now() - started > GIVE_UP_MS) return window.clearInterval(poll);
      if (register()) window.clearInterval(poll);
    }, POLL_MS);

    return () => window.clearInterval(poll);
  }, []);

  if (!available) return null;

  // The trailing separator lives INSIDE the component so the footer's "·"
  // chain doesn't strand an orphan dot for the visitors this doesn't render for.
  return (
    <>
      <button
        type="button"
        onClick={() => window.googlefc?.showRevocationMessage?.()}
        className={className ?? "text-slate-300 hover:text-brand-400"}
      >
        Privacy settings
      </button>
      <span className="text-ink-700">·</span>
    </>
  );
}
