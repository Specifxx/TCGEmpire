"use client";

// One `return_visit` event per returning visitor per day (lib/return-visit.ts). Renders nothing.
import { useEffect } from "react";
import { track } from "@vercel/analytics";
import { ARM_KEYS, RV_KEY, dayOf, pageType, parseRecord, step, viaOf } from "@/lib/return-visit";

// Vercel Analytics mounts behind the consent gate (ConsentGatedAnalytics), a render AFTER this effect runs, and
// `track()` silently drops an event while `window.va` does not exist yet. So wait for it (up to 15 s); a visitor who
// never allows analytics is never counted, the same as their page views (the denominator). Measured 25 Nov: Rift sent
// return_visit for ~2% of daily visitors against Dex's ~12%, and OP sent none at all.
function sendWhenReady(props: Record<string, string>, tries = 0): void {
  if (typeof (window as unknown as { va?: unknown }).va === "function") {
    track("return_visit", props);
    return;
  }
  if (tries < 30) window.setTimeout(() => sendWhenReady(props, tries + 1), 500);
}

export function ReturnBeacon() {
  useEffect(() => {
    try {
      const ls = window.localStorage;
      const { next, event } = step(
        parseRecord(ls.getItem(RV_KEY)),
        dayOf(new Date()),
        pageType(window.location.pathname),
        viaOf(document.referrer, window.location.search, window.location.hostname),
      );
      ls.setItem(RV_KEY, JSON.stringify(next));
      if (!event) return;
      const props: Record<string, string> = { ...event };
      for (const [name, key] of Object.entries(ARM_KEYS)) {
        const v = ls.getItem(key);
        if (v && /^[a-z0-9_-]{1,12}$/i.test(v)) props[name] = v;
      }
      sendWhenReady(props);
    } catch {
      // storage blocked: count nothing
    }
  }, []);
  return null;
}
