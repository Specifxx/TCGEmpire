"use client";

import { useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { PREMIUM_COPY_VERSION } from "@/lib/site";

// /premium's client-side pieces (2026-10-23, the conversion redesign; DECISIONS.md
// "/premium, rebuilt to convert, honestly"). Analytics go through the existing
// trackEvent (Vercel + GA4, lib/analytics.ts), no new vendor, and carry no
// personal data: an event name, a location key, a count. The high-volume ones
// (page view, FAQ opens, billing toggle) are GA4-only (GA4_ONLY_EVENTS).

export type PremiumCtaLocation = "hero" | "deals-teaser" | "demo" | "pricing" | "sticky" | "alert-preview" | "secondary";

/** premium_page_view, once per mount. */
export function PremiumPageView({ signedIn }: { signedIn: boolean }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackEvent("premium_page_view", { signed_in: signedIn, copy: PREMIUM_COPY_VERSION });
  }, [signedIn]);
  return null;
}

/**
 * Wraps a CTA (or several) and records premium_cta_click with its location when
 * a button or link inside is clicked. Capture phase, so it never changes what
 * the button itself does (PremiumCta's checkout, a link's navigation).
 */
export function CtaZone({ location, className, children }: { location: PremiumCtaLocation; className?: string; children: React.ReactNode }) {
  return (
    <div
      className={className}
      onClickCapture={(e) => {
        // A link or a buy button; the billing toggle and table headers are not CTAs.
        const el = (e.target as HTMLElement).closest("a[href], button.btn-buy");
        if (el && !el.hasAttribute("data-no-cta-track")) trackEvent("premium_cta_click", { location, copy: PREMIUM_COPY_VERSION });
      }}
    >
      {children}
    </div>
  );
}

/** The FAQ as <details>, reporting premium_faq_open with the question's key (never free text). */
export function PremiumFaqList({ items }: { items: { id: string; q: string; a: string }[] }) {
  return (
    <div className="mx-auto max-w-2xl space-y-2">
      {items.map((f) => (
        <details
          key={f.id}
          id={`faq-${f.id}`}
          className="card-surface scroll-mt-header rounded-xl border border-ink-700"
          onToggle={(e) => {
            if ((e.currentTarget as HTMLDetailsElement).open) trackEvent("premium_faq_open", { question: f.id });
          }}
        >
          <summary className="cursor-pointer rounded-xl p-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
            {f.q}
          </summary>
          <p className="px-3 pb-3 text-sm leading-relaxed text-slate-400">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

/**
 * The mobile sticky bar: shown once the hero has scrolled away, hidden again
 * while the pricing section is on screen (its own buttons are right there).
 * It links to the pricing section rather than opening checkout itself, so a
 * buyer always reaches checkout from a button with the full terms beside it;
 * the bar still carries the short form of them. Phones only (sm:hidden).
 */
export function PremiumStickyCta({ label, terms, heroId, pricingId }: { label: string; terms: string; heroId: string; pricingId: string }) {
  const [heroGone, setHeroGone] = useState(false);
  const [pricingIn, setPricingIn] = useState(false);
  useEffect(() => {
    const hero = document.getElementById(heroId);
    const pricing = document.getElementById(pricingId);
    if (!hero || !pricing || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.target === hero) setHeroGone(!en.isIntersecting);
        if (en.target === pricing) setPricingIn(en.isIntersecting);
      }
    });
    io.observe(hero);
    io.observe(pricing);
    return () => io.disconnect();
  }, [heroId, pricingId]);
  const show = heroGone && !pricingIn;
  // pr-16 keeps both lines clear of the site-wide Feedback button
  // (FeedbackWidget: fixed right-4, 44px), which sits on this bar's corner.
  return (
    <div
      aria-hidden={!show}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-950/95 pl-4 pr-16 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 motion-safe:transition-transform motion-safe:duration-200 sm:hidden ${
        show ? "translate-y-0" : "pointer-events-none translate-y-full"
      }`}
      data-premium-sticky
    >
      <CtaZone location="sticky">
        <a href={`#${pricingId}`} tabIndex={show ? 0 : -1} className="btn-buy flex min-h-12 w-full items-center justify-center text-base">
          {label}&nbsp;→
        </a>
      </CtaZone>
      <p className="mt-1 text-center text-[10px] leading-snug text-slate-400">{terms}</p>
    </div>
  );
}
