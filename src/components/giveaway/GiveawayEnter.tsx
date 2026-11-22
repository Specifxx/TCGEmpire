"use client";

import { GiveawayPanel, type Me, type PanelApi } from "./GiveawayPanel";
import { markGiveawayEntered } from "./GiveawayPrompt";

// RiftCompare's adapter for the portable entry panel: the static /giveaway page asks /api/giveaway who is looking after mount
// (so the page never reads a cookie), and every action posts there (lib/giveaway-server.ts).
async function call(init?: RequestInit, giveaway?: string): Promise<Me> {
  const url = `/api/giveaway${giveaway ? `?giveaway=${encodeURIComponent(giveaway)}` : ""}`;
  const r = await fetch(url, { cache: "no-store", ...init });
  const j = (await r.json().catch(() => ({}))) as Me;
  if (!r.ok && !j.error) j.error = "Couldn't save that. Please try again.";
  return j;
}

export function GiveawayEnter({ giveaway, cardHref, closesText }: { giveaway: string; cardHref: string; closesText: string }) {
  const api: PanelApi = {
    load: () => call(undefined, giveaway),
    act: (action, extra = {}) =>
      call({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ giveaway, action, ...extra }) }),
    onEntered: markGiveawayEntered,
  };
  return (
    <GiveawayPanel
      api={api}
      closesText={closesText}
      premiumHref="/premium"
      watchHint={
        <>
          watch any card&apos;s price (try{" "}
          <a href={cardHref} className="underline">
            this one
          </a>
          )
        </>
      }
      signIn={
        <a rel="nofollow" href="/login?next=%2Fgiveaway&src=giveaway" className="btn-primary inline-block">
          Sign in free to enter
        </a>
      }
    />
  );
}
