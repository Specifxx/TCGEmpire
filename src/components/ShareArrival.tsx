"use client";
// Counts a visit a shared link brought (lib/share-link.ts): one Vercel event,
// share_visit { medium }, once per tab, when the address carries
// utm_source=share. Nothing about the visitor is stored; the growth report
// reads the totals per site from the Web Analytics API.
import { useEffect } from "react";
import { track } from "@vercel/analytics";

export function ShareArrival() {
  useEffect(() => {
    try {
      const q = new URLSearchParams(location.search);
      if (q.get("utm_source") !== "share" || sessionStorage.getItem("share_visit")) return;
      sessionStorage.setItem("share_visit", "1");
      track("share_visit", { medium: (q.get("utm_medium") || "page").slice(0, 20) });
    } catch {
      /* never in the way */
    }
  }, []);
  return null;
}
