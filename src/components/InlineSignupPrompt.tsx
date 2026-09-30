"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useMe } from "@/lib/use-me";
import { trackEvent } from "@/lib/analytics";
import { trackSignupCta } from "@/lib/growth-events";
import type { InlineSignupSurface } from "@/lib/signup-source-shared";
// The impression and click carry the copy-version stamp, as the removed popup's
// did, so GA4 can compare this era with the popup era on the same tag axis.
import { PREMIUM_COPY_VERSION } from "@/lib/site";

// A SIGN-UP PROMPT THAT IS PART OF THE PAGE (2026-09-30, DECISIONS.md "The
// sign-up slider is gone: sign-up prompts live in the page"). The owner:
// "Let's get rid of the sign up slider altogether. Instead, within the site,
// have areas where it encourages the users to sign up... Users who don't want
// to sign up don't have to. They can use the site, but we don't want to
// interfere with that."
//
// So this is page content, not an interruption:
//   • signed-OUT visitors only, and only once /api/me has really answered
//     (a failed request reads as signed out, and a member must never be asked);
//   • nothing on the server and nothing while loading, so members get no
//     reserved space and the ISR/static pages it sits on stay session-free.
//     Every placement is below the first screen, so its late arrival moves
//     nothing the visitor is looking at;
//   • no modal, no timer, no auto-open, not sticky, no dismiss (there is
//     nothing to dismiss: scrolling past it is the "no");
//   • no price, no gold, no Premium, no countdown or scarcity. It sells the
//     FREE account, and each placement's copy says only what a free account
//     really gets there (lib/free-limits.ts, TierComparisonTable's account
//     column), pinned by tests/signup-inline.test.ts.
//
// The button goes to /login — which is sign-up and sign-in in one ("Either
// button creates your account on the spot"), so there is one button, not two —
// with ?next= back to the page they were on (the same convention every
// contextual /login link uses; lib/next-param.ts sanitises it) and ?src= set to
// the placement, which AuthForm stashes for User.signupSource.
//
// Analytics: signup_inline_view once per mount when half the card is on screen
// (GA4 only, lib/analytics.ts GA4_ONLY_EVENTS: it is an impression), and
// signup_inline_click (both destinations) plus the funnel's signup_cta_click.
// Both carry `surface`, so each placement can be judged on its own.

export interface InlineSignupPromptProps {
  /** The placement: analytics `surface` and the /login ?src= value. */
  surface: InlineSignupSurface;
  title: string;
  body: string;
  /** Where to return after sign-in. Defaults to the current path and query. */
  next?: string;
  className?: string;
}

export function InlineSignupPrompt(props: InlineSignupPromptProps) {
  // useSearchParams needs a Suspense boundary on a statically rendered page;
  // the fallback is what the server renders anyway: nothing.
  return (
    <Suspense fallback={null}>
      <Prompt {...props} />
    </Suspense>
  );
}

function Prompt({ surface, title, body, next, className = "" }: InlineSignupPromptProps) {
  const { user, loaded, answered } = useMe();
  const pathname = usePathname();
  const search = useSearchParams();
  const ref = useRef<HTMLElement>(null);
  const show = loaded && answered === true && !user;

  useEffect(() => {
    if (!show) return;
    const el = ref.current;
    if (!el) return;
    const seen = () => trackEvent("signup_inline_view", { surface, copy: PREMIUM_COPY_VERSION });
    if (typeof IntersectionObserver === "undefined") {
      seen();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          seen();
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show, surface]);

  if (!show) return null;

  const qs = search?.toString();
  const back = next ?? (pathname ? `${pathname}${qs ? `?${qs}` : ""}` : "/");
  const href = `/login?next=${encodeURIComponent(back)}&src=${surface}`;

  return (
    <aside
      ref={ref}
      aria-label="Create a free account"
      data-inline-signup={surface}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-850 p-4 sm:p-5 ${className}`}
    >
      <div className="min-w-0 flex-[1_1_18rem]">
        <p className="text-base font-bold text-white">{title}</p>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">{body}</p>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
        <Link
          href={href}
          rel="nofollow"
          onClick={() => {
            trackEvent("signup_inline_click", { surface, copy: PREMIUM_COPY_VERSION });
            trackSignupCta(surface);
          }}
          className="btn-primary whitespace-nowrap text-sm"
        >
          Create a free account
        </Link>
        <span className="text-xs text-slate-500">Free, no card needed</span>
      </div>
    </aside>
  );
}
