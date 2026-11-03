"use client";

import { useMemo, useState } from "react";
import { track } from "@vercel/analytics";
import { earnCoin } from "@/lib/coins-client";
import { useCountryMaybe } from "@/components/CountryProvider";
import { computeMarket, type MarketRow } from "@/lib/market-rows";
import { priceGap, shareText, shareUrl, type GapRow, type ShareMedium } from "@/lib/share-link";

// Share (2026-11-02, word of mouth; a copy-the-link button since 2026-09): the
// phone's own share sheet where there is one, else the link copied. No pop-up.
// The link is this page's clean URL plus utm_source=share (lib/share-link.ts), and
// the message names the real price gap in the visitor's market when the card
// page passes its rows (or the quick view its in-stock rows). One Vercel event
// per tap, share { medium }; the growth report counts them.
// A drawn icon and text-sm (2026-09-23) to match the heart button beside it;
// `responsive` gives an icon square below sm.
export function ShareButton({
  className,
  responsive = false,
  name,
  rows,
  prices,
  medium = "card",
  path,
}: {
  className?: string;
  responsive?: boolean;
  name?: string;
  /** the card page's rows, every market: the visitor's market is picked here */
  rows?: MarketRow[];
  /** one market's in-stock rows, already chosen (the quick view) */
  prices?: GapRow[];
  medium?: ShareMedium;
  /** defaults to the current page */
  path?: string;
}) {
  const [copied, setCopied] = useState(false);
  const ctx = useCountryMaybe();
  const country = ctx?.country;
  const market = useMemo(() => (rows && country ? computeMarket(rows, country).prices : null), [rows, country]);
  return (
    <button
      onClick={async () => {
        const url = shareUrl(location.origin, path ?? location.pathname, medium);
        const gapRows = prices ?? market ?? null;
        const fmt = ctx?.fmt ?? ((c: number) => `$${(c / 100).toFixed(2)}`);
        const title = name ?? document.title;
        const text = shareText(title, gapRows ? priceGap(gapRows) : null, fmt);
        try {
          track("share", { medium });
        } catch {
          /* analytics never gets in the way */
        }
        // RiftCompare Coins: sharing a price is a task (lib/coins-client.ts).
        earnCoin("share");
        if (typeof navigator.share === "function") {
          try {
            await navigator.share({ title, text, url });
            return;
          } catch (e) {
            if ((e as Error)?.name === "AbortError") return;
          }
        }
        try {
          await navigator.clipboard.writeText(`${text} ${url}`);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard unavailable — ignore */
        }
      }}
      aria-label={name ? `Share ${name}` : "Share this page"}
      title="Share"
      className={`btn-ghost whitespace-nowrap${responsive ? " w-12 px-0 sm:w-auto sm:px-4" : ""} ${className ?? ""}`}
    >
      {/* The glyph swaps to a check while copied, so a phone — where the label
          is hidden — still gets a confirmation. */}
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {copied ? (
          <path d="M20 6 9 17l-5-5" />
        ) : (
          <>
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
            <path d="M16 6l-4-4-4 4" />
            <path d="M12 2v13" />
          </>
        )}
      </svg>
      <span className={responsive ? "hidden sm:inline" : undefined}>{copied ? "Link copied" : "Share"}</span>
    </button>
  );
}
