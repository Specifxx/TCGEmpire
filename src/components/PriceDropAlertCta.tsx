"use client";

import { useState } from "react";
import { useMe } from "@/lib/use-me";
import { useWatchlist } from "@/lib/use-watchlist";
import { useCountry } from "./CountryProvider";
import { markSignupSource } from "@/lib/signup-source";
import { PENDING_WATCH_KEY } from "@/lib/signup-source-shared";
import { trackAuthStart, trackSignupCta } from "@/lib/growth-events";

// "Get a price-drop alert" — the card page's PRIMARY call to action, directly
// under the cheapest price (2026-09-24 growth pass).
//
// Signed in: one click creates the alert (the watchlist is the alert list;
// a watched card emails on a drop).
//
// Signed out: the primary path is ONE click on "Continue with Google/Discord",
// which creates the account AND the alert. The pending watch is stashed before
// the OAuth redirect and SignupWelcome completes it on return — the same
// mechanism PriceAlertModal already used — with ?next= bringing the visitor
// back to this card. Email-only alerts stay available as the secondary option
// (the existing modal's email form, via "price-alert-open").
export function PriceDropAlertCta({
  cardId,
  cardPath,
  providers,
}: {
  cardId: string;
  cardPath: string;
  providers: ("google" | "discord")[];
}) {
  const { user, loaded } = useMe();
  const { watched, watch } = useWatchlist();
  const { country } = useCountry();
  const [busy, setBusy] = useState(false);
  const watching = !!watched?.has(cardId);

  const stashAndStart = (provider: "google" | "discord") => {
    try {
      localStorage.setItem(PENDING_WATCH_KEY, JSON.stringify({ cardId, market: country }));
    } catch {
      /* private mode — the account is still created; the alert is one more click */
    }
    markSignupSource("card_alert");
    trackSignupCta("card_alert");
    trackAuthStart(provider, "card_alert");
  };
  const oauthHref = (provider: "google" | "discord") =>
    `/api/auth/oauth/${provider}?next=${encodeURIComponent(cardPath)}`;
  const emailInstead = () => window.dispatchEvent(new CustomEvent("price-alert-open", { detail: { cardId } }));

  // Reserve the height until the session is known, so the price block does not jump.
  if (!loaded) return <div aria-hidden className="mt-3 h-[4.5rem]" />;

  if (user) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || watching}
          onClick={async () => {
            setBusy(true);
            try {
              await watch(cardId, country);
            } finally {
              setBusy(false);
            }
          }}
          className={watching ? "btn border border-gold/50 bg-gold/15 text-gold" : "btn-primary"}
        >
          {watching ? "✓ Price-drop alert on" : "Get a price-drop alert"}
        </button>
        <span className="text-xs text-slate-400">
          {watching ? "We'll email you when it gets cheaper." : "One click — we email you when it gets cheaper."}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-brand-500/30 bg-brand-500/5 p-3">
      <p className="text-sm font-bold text-white">Get a price-drop alert</p>
      <p className="mt-0.5 text-xs text-slate-400">One click creates your free account and the alert — we email you when this card gets cheaper.</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {providers.includes("google") && (
          <a
            href={oauthHref("google")}
            rel="nofollow"
            onClick={() => stashAndStart("google")}
            className="btn-primary text-sm"
          >
            Continue with Google
          </a>
        )}
        {providers.includes("discord") && (
          <a
            href={oauthHref("discord")}
            rel="nofollow"
            onClick={() => stashAndStart("discord")}
            className="btn border-0 bg-[#5865F2] text-sm text-[#ffffff] hover:brightness-110"
          >
            Continue with Discord
          </a>
        )}
        {/* No provider configured (a preview, a rotated secret): the email
            alert becomes the primary action rather than a dead box. */}
        {providers.length === 0 ? (
          <button type="button" onClick={emailInstead} className="btn-primary text-sm">
            Email me when it drops
          </button>
        ) : (
          <button type="button" onClick={emailInstead} className="tap-link text-xs text-slate-400 underline-offset-2 hover:text-white hover:underline">
            or just email me
          </button>
        )}
      </div>
    </div>
  );
}
