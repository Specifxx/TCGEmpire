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
//
// `compact` is QuickView's variant (2026-09-25): a CardTile tap opens QuickView
// rather than the card page, so most card views never reach the full-size box.
// One row, and every button in it is ghost or brand-coloured, never
// btn-primary: QuickView's retailer buy buttons are that panel's only filled
// CTA (see the "Add to collection" comment there). `placement` keeps the two
// surfaces separable in User.signupSource and the auth_start funnel.
//
// Both variants honour `unpriced` (the compact one did not until 2026-09-26, so
// QuickView — where a spoiler post's card tap lands — offered "Email me when it
// drops" on cards with no price at all). `preorder` then says "pre-order" for an
// unreleased set, matching the email that fires.
//
// `unpriced`: no store has the card in stock (a freshly revealed Radiance card,
// or one listed in the last few days and sold out since — priceState.isEmpty
// covers both). "Gets cheaper" would be a promise the alert could never keep, so
// the copy becomes "in stock" — which lib/price-alerts.ts now actually sends (its
// isFirstPrice notice). Never "first" or "no store has it yet": for the sold-out
// card both are false, with its out-of-stock store rows right below. "When", never "the day": the weekly email cap can hold a
// notice back for anyone emailed in the last seven days.
export function PriceDropAlertCta({
  cardId,
  cardPath,
  providers,
  placement = "card_alert",
  compact = false,
  unpriced = false,
  preorder = false,
  pending = false,
}: {
  cardId: string;
  cardPath: string;
  providers: ("google" | "discord")[];
  placement?: "card_alert" | "quickview_alert";
  compact?: boolean;
  unpriced?: boolean;
  /** The card's set is unreleased (constants.ts isPreorderSetCode). With
   *  `unpriced`, the first notice price-alerts.ts sends is "open for pre-order",
   *  so the copy says pre-order rather than "in stock". */
  preorder?: boolean;
  /** The caller is still loading the prices `unpriced` depends on (QuickView
   *  fetches them client-side). Hold the reserved-height skeleton until then:
   *  rendering early showed "Price-drop alert" on an unreleased card for the
   *  second before its prices arrived, then flipped to the pre-order wording. */
  pending?: boolean;
}) {
  const { user, loaded } = useMe();
  const { watched, watch } = useWatchlist();
  const { country } = useCountry();
  const [busy, setBusy] = useState(false);
  const watching = !!watched?.has(cardId);
  // Name the notice lib/price-alerts.ts will actually send. A priced card gets
  // a drop; an unpriced one gets its isFirstPrice notice, which email.ts words
  // as "open for pre-order" while the set is unreleased and "now in stock"
  // after. The drop and in-stock strings are the ones this component already
  // used; only the pre-order row is new (2026-09-26).
  const copy = !unpriced
    ? { label: "Price-drop alert", get: "Get a price-drop alert", on: "✓ Price-drop alert on", email: "Email me when it drops" }
    : preorder
      ? { label: "Pre-order alert", get: "Get a pre-order alert", on: "✓ Pre-order alert on", email: "Email me when I can pre-order it" }
      : { label: "In-stock alert", get: "Get an in-stock alert", on: "✓ In-stock alert on", email: "Email me when it's in stock" };

  const stashAndStart = (provider: "google" | "discord") => {
    try {
      localStorage.setItem(PENDING_WATCH_KEY, JSON.stringify({ cardId, market: country }));
    } catch {
      /* private mode — the account is still created; the alert is one more click */
    }
    markSignupSource(placement);
    trackSignupCta(placement);
    trackAuthStart(provider, placement);
  };
  const oauthHref = (provider: "google" | "discord") =>
    `/api/auth/oauth/${provider}?next=${encodeURIComponent(cardPath)}`;
  const emailInstead = () =>
    window.dispatchEvent(
      new CustomEvent("price-alert-open", {
        detail: { cardId, notice: !unpriced ? "drop" : preorder ? "preorder" : "stock" },
      }),
    );
  const enable = async () => {
    setBusy(true);
    try {
      await watch(cardId, country);
    } finally {
      setBusy(false);
    }
  };

  // Reserve the height until the session is known, so the price block does not jump.
  if (!loaded || pending) return <div aria-hidden className={compact ? "mt-3 h-12" : "mt-3 h-[4.5rem]"} />;

  if (compact) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-white">{copy.label}:</span>
        {user ? (
          <button
            type="button"
            disabled={busy || watching}
            onClick={enable}
            className={watching ? "btn border border-gold/50 bg-gold/15 text-sm text-gold" : "btn-ghost text-sm"}
          >
            {watching ? copy.on : copy.email}
          </button>
        ) : (
          <>
            {providers.includes("google") && (
              <a href={oauthHref("google")} rel="nofollow" onClick={() => stashAndStart("google")} className="btn-ghost text-sm">
                Continue with Google
              </a>
            )}
            {providers.includes("discord") && (
              <a
                href={oauthHref("discord")}
                rel="nofollow"
                onClick={() => stashAndStart("discord")}
                className="btn border-0 bg-[#5865F2] px-3 text-xs text-[#ffffff] hover:brightness-110"
              >
                Discord
              </a>
            )}
            {providers.length === 0 ? (
              <button type="button" onClick={emailInstead} className="btn-ghost text-sm">
                {copy.email}
              </button>
            ) : (
              <button type="button" onClick={emailInstead} className="tap-link text-xs text-slate-400 underline-offset-2 hover:text-white hover:underline">
                or email me
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  if (user) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || watching}
          onClick={enable}
          className={watching ? "btn border border-gold/50 bg-gold/15 text-gold" : "btn-primary"}
        >
          {watching ? copy.on : copy.get}
        </button>
        <span className="text-xs text-slate-400">
          {unpriced
            ? preorder
              ? "We'll email you when a store we compare has it up for pre-order."
              : "We'll email you when it's in stock."
            : watching
              ? "We'll email you when it gets cheaper."
              : "One click — we email you when it gets cheaper."}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-brand-500/30 bg-brand-500/5 p-3">
      <p className="text-sm font-bold text-white">{copy.get}</p>
      <p className="mt-0.5 text-xs text-slate-400">
        {unpriced
          ? preorder
            ? "Get an email when a store we compare has it up for pre-order."
            : "Get an email when it's in stock. No store has it in stock yet."
          : "One click creates your free account and the alert — we email you when this card gets cheaper."}
      </p>
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
            {copy.email}
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
