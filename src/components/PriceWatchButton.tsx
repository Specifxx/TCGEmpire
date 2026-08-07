"use client";

import { useState } from "react";
import { useMe } from "@/lib/use-me";
import { useWatchlist } from "@/lib/use-watchlist";
import { useCountry } from "./CountryProvider";

// "Watch this card's price" — and, now, "stop watching it".
//
// TWO AUDIENCES, ONE BUTTON:
//   • Signed OUT — unchanged behaviour. Dispatches the same price-alert-prompt
//     event PriceAlertModal already listens for, which collects an email. No
//     account required, because the anonymous flow is a real conversion path and
//     gating it behind sign-up would cost more than the watchlist gains.
//   • Signed IN — a real toggle against the account's watchlist, so the button
//     can finally show whether you are already watching, and let you stop.
//
// The prop signature is deliberately unchanged ({ cardId, variant }) so all five
// call sites — CardTile, QuickView, games/shared, and two on the card page —
// compile untouched. In particular the card page is an ISR route: this component
// reads the session client-side precisely so that page stays cacheable.
export function PriceWatchButton({
  cardId,
  variant = "icon",
}: {
  cardId: string;
  variant?: "icon" | "full";
}) {
  const { user, loaded: meLoaded } = useMe();
  const { watched, watch, unwatch } = useWatchlist();
  const { country } = useCountry();
  const [busy, setBusy] = useState(false);

  const watching = !!watched?.has(cardId);

  async function click(e: React.MouseEvent) {
    // LOAD-BEARING: this button is a SIBLING of the tile's <Link>, not a child,
    // and these two calls are why toggling a watch never navigates to the card
    // or trips the top loading bar. See the note in CardTile.
    e.preventDefault();
    e.stopPropagation();
    if (busy || !meLoaded) return;

    if (!user) {
      window.dispatchEvent(new CustomEvent("price-alert-prompt", { detail: { cardId } }));
      return;
    }

    setBusy(true);
    try {
      if (watching) await unwatch(cardId);
      else await watch(cardId, country);
    } finally {
      setBusy(false);
    }
  }

  const bell = (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      // Filled when watching — the state has to be legible at tile size, where
      // there is no room for a label.
      fill={watching ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const label = watching ? "Stop watching this card" : "Watch this card's price";
  const hint = watching
    ? "You'll get an email when the price drops — click to stop"
    : "Get an email when the price drops";

  if (variant === "full") {
    return (
      <button
        onClick={click}
        disabled={busy}
        aria-pressed={watching}
        aria-label={label}
        title={hint}
        className={
          watching
            ? "btn border border-gold/50 bg-gold/15 text-gold hover:bg-gold/25"
            : "btn bg-ink-800 text-slate-200 hover:bg-ink-700"
        }
      >
        {bell}
        {watching ? "Watching" : "Watch price"}
      </button>
    );
  }

  return (
    <button
      onClick={click}
      disabled={busy}
      aria-pressed={watching}
      aria-label={label}
      title={hint}
      className={`tap-icon rounded-full border transition-colors ${
        watching
          ? "border-gold/60 bg-ink-950/80 text-gold"
          : "border-ink-600 bg-ink-950/80 text-slate-300 hover:border-gold/50 hover:text-gold"
      }`}
    >
      {bell}
    </button>
  );
}
