"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { trackNewsletterSignup } from "@/lib/growth-events";

// Email capture for the weekly Index-summary list. Used in the footer (default) and
// inline on high-intent pages (movers, countdown, the pre-release Radiance surfaces)
// via the props — `source` attributes which surface converted, `heading`/`cta`/`done`
// tailor the copy, and `variant="card"` renders a boxed inline unit instead of the
// bare footer row.
export function NewsletterSignup({
  siteName,
  source = "footer",
  heading,
  cta = "Sign up",
  done,
  variant = "footer",
  trackEvent = "newsletter_signup",
  button = "primary",
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
  // "ghost" renders the submit as .btn-ghost, for a page where another CTA is
  // the primary (2026-09-23: radiance-tagged articles, where the capture sits
  // between "Compare Radiance preorder prices" and "Ready to buy?" — a third
  // filled green button in one screen would compete with both).
  button?: "primary" | "ghost";
}) {
  // May render OUTSIDE CountryProvider (footer) — read the market cookie directly.
  // Falls back to the site default (US) when no market cookie is set yet.
  const country = typeof document !== "undefined" ? /(?:^|; )country=(\w+)/.exec(document.cookie)?.[1] ?? "US" : "US";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);

  // On success the focused submit button is swapped for the done message, which
  // dropped keyboard focus to <body> and told a screen reader nothing
  // (2026-09-23). Move focus to the message (tabIndex={-1}), which also reads it
  // out — but only if focus is still here: a visitor who tabbed away while the
  // request was in flight keeps their place.
  useEffect(() => {
    if (state !== "done") return;
    const active = document.activeElement;
    if (!active || active === document.body || formRef.current?.contains(active)) doneRef.current?.focus();
  }, [state]);

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
      // newsletter_signup{placement} on every successful signup (2026-09-24),
      // plus the surface's own named event where it has one.
      if (r.ok) {
        trackNewsletterSignup(source);
        if (trackEvent !== "newsletter_signup") track(trackEvent, { source });
      }
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
    <form ref={formRef} className={outer} onSubmit={submit}>
      {state === "done" ? (
        <p ref={doneRef} tabIndex={-1} role="status" className="text-sm font-semibold text-brand-400">
          {doneMsg}
        </p>
      ) : (
        <>
          <span className={`w-full text-sm font-semibold text-slate-200 ${variant === "footer" ? "text-slate-300" : ""}`}>
            {label}
          </span>
          <div className={variant === "card" ? "flex flex-wrap gap-2" : "contents"}>
            {/* No `text-sm` here (2026-09-23): it overrode .input's base
                text-base, so this field was 14px on every phone, and iOS
                Safari zooms the page into a focused field under 16px and does
                not zoom back out. .input's own `text-base … sm:text-sm` now
                applies. autoComplete="email" lets a phone keyboard offer the
                saved address. The height is unchanged: .input's min-h-11
                already overrides h-9.
                w-48 in the card (2026-09-23), w-52 in the footer: the card's
                inner width on a 390px phone article is 316px, and 208 + 8 gap +
                the 102px ghost "Notify me" (1px border each side) is 318, so
                the button wrapped onto its own row. At 192 it shares the row.
                flex-1 still grows the field to fill any wider card. */}
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={`input h-9 ${variant === "card" ? "w-48" : "w-52"} flex-1`}
              aria-label="Email address"
            />
            <button
              type="submit"
              disabled={state === "busy"}
              className={`${button === "ghost" ? "btn-ghost" : "btn-primary"} h-9 shrink-0 text-sm disabled:opacity-50`}
            >
              {state === "busy" ? "…" : cta}
            </button>
          </div>
          {state === "error" && (
            <span role="alert" className="w-full text-xs text-rose-400">
              Check the email and try again.
            </span>
          )}
          {variant === "card" && (
            <span className="text-[11px] text-slate-500">Free, weekly-ish, unsubscribe anytime.</span>
          )}
        </>
      )}
    </form>
  );
}
