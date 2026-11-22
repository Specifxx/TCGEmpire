"use client";

// After a buy click on a card page (retention, 2026-11-22, Head of Retention): an INLINE block,
// never a pop-up or overlay, appears in the page flow under the buy row once the visitor clicks a
// store for THIS card, and offers the two things that bring someone back: watch the price, or add
// the card to their collection. OutboundLink announces the click with the window event
// BUY_CLICK_EVENT; nothing here reads a cookie, a header or the session on the server (the card
// page stays one cached copy). Dismissible, and shown at most once per card per tab.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMe } from "@/lib/use-me";
import { trackEvent } from "@/lib/analytics";
import { BUY_CLICK_EVENT, type BuyClickDetail } from "@/lib/buy-click-event";
import { PriceWatchButton } from "./PriceWatchButton";

export function BuyFollowUp({ cardId, cardName }: { cardId: string; cardName: string }) {
  const { user, loaded } = useMe();
  const [shown, setShown] = useState(false);
  const [added, setAdded] = useState<"idle" | "busy" | "done" | "error">("idle");

  useEffect(() => {
    const key = `rc_buyfollow_${cardId}`;
    const onClick = (e: Event) => {
      const d = (e as CustomEvent<BuyClickDetail>).detail;
      if (d?.cardId !== cardId) return;
      try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
      } catch {
        /* storage blocked: still show it once this page view */
      }
      setShown(true);
      trackEvent("buy_followup_shown", { signed_in: !!user });
    };
    window.addEventListener(BUY_CLICK_EVENT, onClick);
    return () => window.removeEventListener(BUY_CLICK_EVENT, onClick);
  }, [cardId, user]);

  if (!shown) return null;

  async function addToCollection() {
    setAdded("busy");
    trackEvent("buy_followup_collection");
    const ok = await fetch("/api/collection", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId, quantity: 1 }),
    })
      .then((r) => r.ok)
      .catch(() => false);
    setAdded(ok ? "done" : "error");
  }

  const next = typeof window !== "undefined" ? encodeURIComponent(window.location.pathname) : "";
  return (
    <aside aria-label="After you buy" className="mt-3 rounded-xl border border-ink-700 bg-ink-850 p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-white">Bought {cardName}, or still deciding?</p>
        <button type="button" onClick={() => setShown(false)} className="text-xs text-slate-500 hover:text-slate-300" aria-label="Close">
          ✕
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-400">Watch it and we email you when a store drops the price, or add it to your collection to track what it&apos;s worth.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <PriceWatchButton cardId={cardId} variant="full" />
        {!loaded ? null : user ? (
          added === "done" ? (
            <Link href="/portfolio" className="btn-ghost text-xs">Added. See your collection →</Link>
          ) : (
            <button type="button" onClick={addToCollection} disabled={added === "busy"} className="btn-ghost text-xs">
              {added === "busy" ? "Adding…" : added === "error" ? "Couldn't add, try again" : "I bought it: add to my collection"}
            </button>
          )
        ) : (
          <Link href={`/login?next=${next}&src=buy_followup`} className="btn-ghost text-xs" onClick={() => trackEvent("buy_followup_signin")}>
            Sign in to track your collection
          </Link>
        )}
      </div>
    </aside>
  );
}
