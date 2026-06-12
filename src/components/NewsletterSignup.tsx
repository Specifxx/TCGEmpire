"use client";

import { useState } from "react";

// Footer email capture (user feedback: visible signup, no wishlist required).
// The list feeds the weekly Index-summary email.
export function NewsletterSignup({ siteName }: { siteName: string }) {
  // Footer renders OUTSIDE CountryProvider — read the market cookie directly.
  const country = typeof document !== "undefined" ? /(?:^|; )country=(\w+)/.exec(document.cookie)?.[1] ?? "AU" : "AU";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  return (
    <form
      className="mx-auto mb-4 flex max-w-md flex-wrap items-center justify-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setState("error");
        setState("busy");
        try {
          const r = await fetch("/api/newsletter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email.trim(), market: country }),
          });
          setState(r.ok ? "done" : "error");
        } catch {
          setState("error");
        }
      }}
    >
      {state === "done" ? (
        <p className="text-sm font-semibold text-brand-400">✓ You&apos;re on the list — first summary lands this week.</p>
      ) : (
        <>
          <span className="w-full text-sm font-semibold text-slate-300">
            📬 Get the weekly {siteName} Index summary in your inbox
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="input h-9 w-52 flex-1 text-sm"
            aria-label="Email address"
          />
          <button type="submit" disabled={state === "busy"} className="btn-primary h-9 shrink-0 text-sm disabled:opacity-50">
            {state === "busy" ? "…" : "Sign up"}
          </button>
          {state === "error" && <span className="w-full text-xs text-rose-400">Check the email and try again.</span>}
        </>
      )}
    </form>
  );
}
