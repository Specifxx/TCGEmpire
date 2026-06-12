"use client";

import Link from "next/link";
import { useState } from "react";

// The Premium subscribe button. Three states: checkout live (Stripe hosted
// checkout), signed out (route through login first), or checkout not yet
// configured (honest waitlist CTA via the contact form — no fake buy button).
export function PremiumCta({ checkoutLive, signedIn }: { checkoutLive: boolean; signedIn: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subscribe() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/premium/checkout", { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Couldn't start checkout");
        return;
      }
      window.location.href = d.url;
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) {
    return (
      <div>
        <p className="text-sm font-semibold text-white">Ready when you are</p>
        <Link href="/register?next=/premium" className="btn-primary mt-3 text-sm">Create a free account first →</Link>
      </div>
    );
  }
  if (!checkoutLive) {
    return (
      <div>
        <p className="text-sm font-semibold text-white">Launching very soon</p>
        <p className="mt-1 text-xs text-slate-400">Want founding-member pricing? Say hi and you&apos;re on the list.</p>
        <Link href="/contact" className="btn-primary mt-3 text-sm">Join the waitlist →</Link>
      </div>
    );
  }
  return (
    <div>
      <p className="text-sm font-semibold text-white">Become a founding member</p>
      <button onClick={subscribe} disabled={busy} className="btn-primary mt-3 text-sm disabled:opacity-50">
        {busy ? "Opening checkout…" : "★ Subscribe"}
      </button>
      {error && (
        <div className="mt-2 text-xs">
          <p className="text-rose-400">{error}</p>
          {/* Recovery path — a failed checkout must never be a dead end. */}
          <p className="mt-1 text-slate-400">
            <button onClick={subscribe} className="text-brand-400 hover:underline">Try again</button>
            {" · or "}
            <Link href="/contact" className="text-brand-400 hover:underline">join the waitlist</Link>
            {" and we'll email you when it's sorted."}
          </p>
        </div>
      )}
    </div>
  );
}
