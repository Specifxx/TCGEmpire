"use client";

import { useState } from "react";
import { track } from "@vercel/analytics";

// Email capture for the weekly Index-summary list. Used in the footer (default) and
// inline on high-intent pages (movers, countdown) via the props — `source` attributes
// which surface converted, `heading`/`cta`/`done` tailor the copy, and `variant="card"`
// renders a boxed inline unit instead of the bare footer row.
export function NewsletterSignup({
  siteName,
  source = "footer",
  heading,
  cta = "Sign up",
  done,
  variant = "footer",
  trackEvent = "newsletter_signup",
}: {
  siteName: string;
  source?: string;
  heading?: string;
  cta?: string;
  done?: string;
  variant?: "footer" | "card";
  // Lets a call site fire its own distinctly-named event (e.g. Radiance's
  // "Notify me" wants `radiance_notify_click`, not a generic signup event) while
  // still sharing this exact submit handler/validation/API call — the ask is one
  // handler, not one event name.
  trackEvent?: string;
}) {
  // May render OUTSIDE CountryProvider (footer) — read the market cookie directly.
  // Falls back to the site default (US) when no market cookie is set yet.
  const country = typeof document !== "undefined" ? /(?:^|; )country=(\w+)/.exec(document.cookie)?.[1] ?? "US" : "US";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const label = heading ?? `📬 Get the weekly ${siteName} market summary in your inbox`;
  const doneMsg = done ?? "✓ You're on the list — first summary lands this week.";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setState("error");
    setState("busy");
    try {
      const r = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), market: country, source }),
      });
      if (r.ok) track(trackEvent, { source });
      setState(r.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  const outer =
    variant === "card"
      ? "flex flex-col gap-2 rounded-xl border border-ink-700 bg-ink-850 p-5"
      : "mx-auto mb-4 flex max-w-md flex-wrap items-center justify-center gap-2";

  return (
    <form className={outer} onSubmit={submit}>
      {state === "done" ? (
        <p className="text-sm font-semibold text-brand-400">{doneMsg}</p>
      ) : (
        <>
          <span className={`w-full text-sm font-semibold text-slate-200 ${variant === "footer" ? "text-slate-300" : ""}`}>
            {label}
          </span>
          <div className={variant === "card" ? "flex flex-wrap gap-2" : "contents"}>
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
              {state === "busy" ? "…" : cta}
            </button>
          </div>
          {state === "error" && <span className="w-full text-xs text-rose-400">Check the email and try again.</span>}
          {variant === "card" && (
            <span className="text-[11px] text-slate-500">Free, weekly-ish, unsubscribe anytime.</span>
          )}
        </>
      )}
    </form>
  );
}
