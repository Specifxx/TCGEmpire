"use client";
// "Share this deal with your group chat" (owner, 2026-11-23; ported from DexCompare): the phone's share sheet, else one line copied
// with the cheapest STORE's real in-stock price in the visitor's market (lib/share-link.ts dropText: never eBay, TCGplayer or Amazon, never
// converted) and this page's canonical link tagged utm_medium=drop. People paste drops into restock chats anyway; this makes the link
// they paste ours. Separate from ShareButton (its share-for-a-deal A/B test is untouched). Event: share { medium: "drop" }.
// Renders nothing where the visitor's market has no in-stock store price (text null).
import { useEffect, useRef, useState } from "react";
import { track } from "@vercel/analytics";

import { SITE_URL } from "@/lib/site";
import { shareUrl } from "@/lib/share-link";



export function DropShare({ path, name, text, className = "" }: { path: string; name: string; /** lib/share-link.ts dropText, written on the server for the visitor's market; null renders nothing */ text: string | null; className?: string }) {
  const [note, setNote] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!text) return null;
  const say = (t: string) => {
    setNote(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(""), 2500);
  };
  async function share() {
    const url = shareUrl(SITE_URL, path, "drop");
    try {
      track("share", { medium: "drop" });
    } catch {}
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: name, text: text!, url });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      say("Copied. Paste it in your group chat");
    } catch {
      say("Couldn’t copy the link");
    }
  }
  return (
    <span className={`relative inline-flex ${className}`}>
      <button type="button" onClick={share} aria-label="Share this deal with your group chat" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-slate-400 underline underline-offset-4 hover:text-slate-100">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v13" /></svg>
        Share deal
      </button>
      <span role="status" aria-live="polite" className={`pointer-events-none absolute left-0 top-full z-10 mt-1 whitespace-nowrap rounded-full bg-ink-800 px-3 py-1.5 text-xs font-semibold text-white shadow transition-opacity motion-reduce:transition-none ${note ? "opacity-100" : "opacity-0"}`}>
        {note}
      </span>
    </span>
  );
}
