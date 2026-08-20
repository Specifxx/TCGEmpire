"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Sign-in is OAUTH ONLY — Google and Discord. The email/password form, /register,
// /forgot and /reset were removed along with their API routes.
//
// Existing password accounts are NOT orphaned: the OAuth callback finds a user by
// provider id and then FALLS BACK TO EMAIL (upsertOAuthUser in
// api/auth/oauth/[provider]/callback), linking the identity to the account that
// already owns that address. So a member who registered with a password signs in
// with Google or Discord on the same address and lands on their existing account,
// wallet, listings and orders intact.
//
// The one group this cannot serve is someone whose account email is at a provider
// they don't use for Google or Discord. They need support to link an identity —
// hence the note at the bottom of the card rather than a dead end.

const OAUTH_ERRORS: Record<string, string> = {
  provider_unavailable: "That sign-in option isn't available right now — try the other one.",
  oauth_state: "Sign-in expired or was interrupted. Please try again.",
  oauth_token: "Couldn't complete sign-in with that provider. Please try again.",
  oauth_profile: "Couldn't read your profile from that provider. Please try again.",
  oauth_noemail: "That provider didn't share an email address, which we need to create your account.",
  oauth_unverified:
    "That provider hasn't confirmed your email address yet. Verify it with them first, then sign in here again.",
  oauth_session: "Something went wrong finishing sign-in. Please try again.",
};

export function AuthForm({
  providers,
  bare = false,
  compact = false,
  cancelHref,
  signupPremiumDays = 0,
}: {
  providers: ("google" | "discord")[];
  // Skip the outer full-page wrapper (max-width + vertical padding) so this can be
  // embedded directly inside a modal, which provides its own sizing. /login omits
  // this and gets the original standalone layout.
  bare?: boolean;
  // Drop the heading, the value-prop paragraph, the surrounding card chrome and
  // the password-migration footnote, leaving just the provider buttons.
  //
  // For SignupPromoPopup, which already states the pitch immediately above this
  // form. Rendering both meant the same three perks were listed TWICE, one
  // restatement under the other, inside a dialog whose excessive height is what
  // pushed its own close button off-screen on a phone (see the layout note in
  // SignupPromoPopup). Height here is not cosmetic — it is the bug.
  compact?: boolean;
  // Standalone /login only (bare's modal already has its own close button). A
  // visitor who lands here off a gated feature, unasked, previously had no way
  // out but the browser Back button — a dead end matching the exact pattern
  // WS4 collapsed elsewhere on the site. /login/page.tsx computes this from
  // ?next=, falling back to the homepage.
  cancelHref?: string;
  // lib/premium.ts's SIGNUP_PREMIUM_DAYS, threaded down from a server component
  // (this file has no server-only imports, so it can't read it directly). Default
  // 0 renders the plain account-only pitch, matching the comp being turned off.
  signupPremiumDays?: number;
}) {
  const [error, setError] = useState<string | null>(null);

  // Surface OAuth failures redirected back as ?error=…
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("error");
    if (e) setError(OAUTH_ERRORS[e] ?? "Sign-in failed — please try again.");
  }, []);

  const wrapperClass = bare ? "" : "mx-auto w-full max-w-sm py-10";

  return (
    <div className={wrapperClass}>
      <div className={compact ? "" : "card-surface p-6"}>
        {!bare && cancelHref && (
          <Link href={cancelHref} className="mb-3 inline-block text-xs text-slate-500 hover:text-white">
            ← Back
          </Link>
        )}
        {!compact && (
          <>
            <h1 className="text-xl font-extrabold text-white">Sign in</h1>
            <p className="mt-1 text-sm text-slate-400">
              A free account unlocks price alerts, your portfolio and your watchlist
              {signupPremiumDays > 0 && (
                <>
                  {" "}
                  — plus your first{" "}
                  <span className="font-semibold text-gold">
                    {signupPremiumDays === 1 ? "day" : `${signupPremiumDays} days`} of Premium
                  </span>{" "}
                  free
                </>
              )}
              . No password to remember — creating an account and signing in are the same button.
            </p>
          </>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        {/* Only render a provider's button when its env keys are configured, so we
            never show a button that just redirects back with an error. */}
        <div className="mt-5 flex flex-col gap-2.5">
          {providers.includes("google") && (
            <a
              href="/api/auth/oauth/google"
              className="flex items-center justify-center gap-2.5 rounded-xl border border-ink-600 bg-white py-2.5 text-sm font-semibold text-ink-950 hover:brightness-95"
            >
              <GoogleIcon /> Continue with Google
            </a>
          )}
          {providers.includes("discord") && (
            <a
              href="/api/auth/oauth/discord"
              className="flex items-center justify-center gap-2.5 rounded-xl bg-[#5865F2] py-2.5 text-sm font-semibold text-white hover:brightness-110"
            >
              <DiscordIcon /> Continue with Discord
            </a>
          )}
        </div>

        {/* Both providers are configured in production; this is the fence for a
            misconfigured preview or a rotated secret, so the page still says
            something true instead of rendering an empty card. */}
        {providers.length === 0 && (
          <p className="mt-5 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            Sign-in is temporarily unavailable. Please try again shortly.
          </p>
        )}

        <p className={`${compact ? "mt-3" : "mt-5"} text-center text-xs text-slate-500`}>
          New here? Either button creates your account on the spot.
        </p>
        {/* The password-migration note is genuinely useful on /login, where
            someone actively troubleshooting sign-in has room to read it. In the
            promo popup it is four lines of edge-case prose that push the dialog
            past the height of a phone screen; /login remains one tap away. */}
        {!compact && (
          <p className="mt-2 text-center text-xs text-slate-500">
            Signed up with a password before? Use the same email address with Google or Discord and you&apos;ll
            land straight back on your existing account. If that address isn&apos;t on either,{" "}
            <a href="/contact" className="text-brand-400 hover:underline">
              contact us
            </a>{" "}
            and we&apos;ll link it for you.
          </p>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.4 5.4 2.6 13.3l7.8 6.1C12.2 13.2 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.4 5.7C43.9 38 46.5 31.8 46.5 24.5z" />
      <path fill="#FBBC05" d="M10.4 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.7l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.5l-7.4-5.7c-2 1.4-4.7 2.3-7.9 2.3-6.4 0-11.8-3.7-13.6-8.9l-7.8 6.1C6.4 42.6 14.6 48 24 48z" />
    </svg>
  );
}
function DiscordIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.4a18 18 0 0 1 4.3 1.4 16.7 16.7 0 0 0-14.8 0A18 18 0 0 1 9 3.4L8.7 3a19.8 19.8 0 0 0-5 1.4A20.6 20.6 0 0 0 .2 18.4 19.9 19.9 0 0 0 6.3 21l.4-.6a13 13 0 0 1-2-1l.5-.4a14 14 0 0 0 12 0l.5.4c-.6.4-1.3.7-2 1l.4.6a19.9 19.9 0 0 0 6-2.6 20.6 20.6 0 0 0-3.5-14zM8.4 15.3c-1 0-1.7-.9-1.7-2s.8-2 1.7-2 1.7.9 1.7 2-.8 2-1.7 2zm7.2 0c-1 0-1.7-.9-1.7-2s.8-2 1.7-2 1.7.9 1.7 2-.7 2-1.7 2z" />
    </svg>
  );
}
