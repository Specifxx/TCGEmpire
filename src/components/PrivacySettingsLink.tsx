"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// "Privacy settings" — the persistent, EVERY-REGION entry point.
// ─────────────────────────────────────────────────────────────────────────────
// This used to render nothing until Google's Funding Choices object (googlefc)
// appeared, which only happens for EEA/UK/CH visitors. Everywhere else the
// footer had no such control — while /privacy told every reader, in every
// region, that they "can change your answer at any time using the Privacy
// settings link in the footer". A policy that describes a control the visitor
// cannot find is a policy-accuracy problem in its own right, and it is exactly
// the kind of thing an ad-network reviewer checks by simply looking.
//
// So the control is now unconditional, and it does the right thing per region:
//
//   • Consent message applies (googlefc present) → re-opens it via Google's
//     documented API, googlefc.showRevocationMessage(), so the visitor can
//     actually change their answer.
//   • No consent message applies (outside the EEA/UK/CH) → there is no stored
//     consent to revoke, so it goes to the privacy policy's advertising section,
//     which carries the Google Ads Settings and aboutads.info opt-outs that DO
//     apply to them.
//
// Either way the footer link exists and leads somewhere useful, which is what
// the policy claims.
type GoogleFc = {
  callbackQueue?: { push: (cb: Record<string, () => void>) => void };
  showRevocationMessage?: () => void;
};

declare global {
  interface Window {
    googlefc?: GoogleFc;
  }
}

const POLL_MS = 500;
const GIVE_UP_MS = 15000;

export function PrivacySettingsLink({ className }: { className?: string }) {
  // Whether Google's consent message is available to re-open for this visitor.
  const [canReopen, setCanReopen] = useState(false);

  useEffect(() => {
    let done = false;
    const started = Date.now();

    const register = () => {
      const fc = window.googlefc;
      if (!fc) return false;
      fc.callbackQueue = fc.callbackQueue ?? ([] as unknown as GoogleFc["callbackQueue"]);
      fc.callbackQueue?.push({
        CONSENT_DATA_READY: () => {
          if (!done && typeof window.googlefc?.showRevocationMessage === "function") {
            done = true;
            setCanReopen(true);
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

  const cls = className ?? "text-slate-300 hover:text-brand-400";

  // The trailing separator lives INSIDE the component so the footer's "·" chain
  // stays correct whichever variant renders.
  return (
    <>
      {canReopen ? (
        <button type="button" onClick={() => window.googlefc?.showRevocationMessage?.()} className={cls}>
          Privacy settings
        </button>
      ) : (
        <Link href="/privacy#advertising" className={cls}>
          Privacy settings
        </Link>
      )}
      <span className="text-ink-700">·</span>
    </>
  );
}
