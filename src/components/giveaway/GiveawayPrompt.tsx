"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { armNudge, countSessionView } from "@/lib/nudge-runtime";
import { PRICING_NUDGE_SESSION_KEY, RATE_SESSION_KEY } from "@/lib/rate-prompt";
import { CURRENT_GIVEAWAY as G } from "@/lib/giveaway";
import {
  GIVEAWAY_PROMPT_DELAY_MS,
  GIVEAWAY_PROMPT_SESSION_KEY,
  GIVEAWAY_PROMPT_STORAGE_KEY,
  markDone,
  markShown,
  parsePromptState,
  shouldShowGiveawayPrompt,
  type GiveawayPromptState,
} from "@/lib/giveaway-prompt";
import { useEscapeLayer } from "../ui/Dialog";

// The giveaway's one corner card (owner, 2026-11-22; rules in lib/giveaway-prompt.ts). A small card, not a modal: the page
// stays usable under it, and ✕, Escape and "Not now" close it; "Don't show again" ends it for this giveaway.

function load(): GiveawayPromptState {
  try {
    return parsePromptState(localStorage.getItem(GIVEAWAY_PROMPT_STORAGE_KEY));
  } catch {
    return parsePromptState(null);
  }
}
function save(s: GiveawayPromptState) {
  try {
    localStorage.setItem(GIVEAWAY_PROMPT_STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* private mode: it never shows without a remembered count */
  }
}
function flag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return true; // no session storage: treat the visit's slot as taken
  }
}

/** Called by the entry box once this browser's account has entered: the card never shows again. */
export function markGiveawayEntered() {
  save(markDone(load()));
}

export function GiveawayPrompt() {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) return;
    const pages = countSessionView("rc_gw_views", path);
    const ask = () =>
      shouldShowGiveawayPrompt(load(), Date.now(), path, {
        pages,
        // "tcg-sale-popup": the Cyber Weekend sale card (TcgSalePopup) already had this visit's one prompt.
        otherPromptShown: flag(GIVEAWAY_PROMPT_SESSION_KEY) || flag(RATE_SESSION_KEY) || flag(PRICING_NUDGE_SESSION_KEY) || flag("tcg-sale-popup"),
      });
    if (!ask()) return;
    return armNudge({
      delayMs: GIVEAWAY_PROMPT_DELAY_MS,
      onFire: () => {
        if (!ask()) return;
        save(markShown(load(), Date.now()));
        try {
          sessionStorage.setItem(GIVEAWAY_PROMPT_SESSION_KEY, "1");
          // Hold the visit's one prompt slot, so the sale card (TcgSalePopup) stands down after it.
          if (!sessionStorage.getItem("rc_prompt_slot")) sessionStorage.setItem("rc_prompt_slot", "giveaway");
        } catch {
          /* nothing */
        }
        setOpen(true);
        try {
          (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", "giveaway_prompt_show", { giveaway: G.key });
        } catch {
          /* analytics never blocks */
        }
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEscapeLayer(open, () => setOpen(false));

  if (!open) return null;
  return (
    <aside
      role="complementary"
      aria-label="Giveaway"
      className="above-bottombar fixed right-4 z-[70] w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-gold/30 bg-ink-900/95 p-4 text-left shadow-2xl backdrop-blur"
      data-giveaway-prompt
    >
      <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute right-2 top-2 rounded px-2 text-lg opacity-60 hover:opacity-100">
        ×
      </button>
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={G.imageUrl} alt="" aria-hidden="true" width={56} height={78} className="h-[78px] w-14 flex-none rounded-md" />
        <div className="min-w-0 pr-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold">Free giveaway · closes 14 Dec</p>
          <p className="mt-0.5 font-bold leading-snug">{G.title}</p>
          <p className="mt-1 text-sm opacity-80">Free to enter, worldwide. 50 points free, +5 for every daily check-in.</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Link
          href="/giveaway"
          prefetch={false}
          onClick={() => {
            setOpen(false);
            try {
              (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", "giveaway_prompt_click", { giveaway: G.key });
            } catch {
              /* nothing */
            }
          }}
          className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-black"
        >
          Enter free →
        </Link>
        <button type="button" onClick={() => setOpen(false)} className="text-sm opacity-70 hover:opacity-100">
          Not now
        </button>
        <button
          type="button"
          onClick={() => {
            save(markDone(load()));
            setOpen(false);
          }}
          className="ml-auto text-xs opacity-60 hover:opacity-100"
        >
          Don&apos;t show again
        </button>
      </div>
    </aside>
  );
}
