"use client";

import { useState } from "react";
import Link from "next/link";

// Fires the actual grant. The page around this component only ever GETs
// (server-rendered, no mutation) — this button is the one and only thing
// that POSTs to /api/premium/winback-claim, and only on an explicit click,
// never on mount. See lib/premium-winback.ts's header comment for why that
// distinction matters here specifically (a mail-scanner pre-fetch of the
// page must not be able to burn the one-time claim).
export function PremiumWinbackClaimButton({ days }: { days: number }) {
  const [state, setState] = useState<"idle" | "claiming" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const token = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") ?? "" : "";

  async function claim() {
    setState("claiming");
    setError(null);
    try {
      const res = await fetch("/api/premium/winback-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setState("done");
      } else {
        setState("error");
        setError(
          data?.reason === "already-claimed"
            ? "This link has already been used."
            : data?.reason === "expired"
              ? "This link has expired."
              : "Something went wrong — please try again in a moment.",
        );
      }
    } catch {
      setState("error");
      setError("Network hiccup — please try again.");
    }
  }

  if (state === "done") {
    return (
      <div className="mt-4">
        <div className="text-3xl" aria-hidden>🎉</div>
        <h2 className="mt-2 text-lg font-extrabold text-white">You&apos;re on Premium for {days} days</h2>
        <p className="mt-1 text-sm text-slate-400">No card needed, nothing to cancel — it just ends on its own.</p>
        <Link href="/premium" className="btn-primary mt-4 inline-flex">See what&apos;s unlocked →</Link>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <button onClick={claim} disabled={state === "claiming"} className="btn-primary">
        {state === "claiming" ? "Claiming…" : `Claim my ${days} free days`}
      </button>
      {state === "error" && error && <p role="alert" className="mt-3 text-sm text-rose-400">{error}</p>}
    </div>
  );
}
