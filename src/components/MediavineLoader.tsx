"use client";

import { useEffect } from "react";
import { AD_FREE_ATTR } from "@/lib/ad-free-boot";

// ─────────────────────────────────────────────────────────────────────────────
// Journey by Mediavine — on blog and guide articles ONLY (owner, 2026-10-26).
// ─────────────────────────────────────────────────────────────────────────────
// Added site-wide on 2026-10-24 after the Journey approval. Since 2026-10-26 it
// is rendered only by /blog/[slug] and /guides/[slug], never on a card, set,
// sealed, price or tool page: those are where readers buy, and an affiliate
// visit earns far more than an ad view (DECISIONS.md, "AdSense off, Journey on
// articles only"). Four weeks on, affiliate earnings per article visit decide
// whether it stays.
//
// Three rules:
//   • An ad-free visitor (a paid member: data-adfree, set in <head> by
//     lib/ad-free-boot.ts before anything paints) never loads it. Premium
//     promises no ads.
//   • Injected from an effect, so a client-side visit to an article loads it
//     too (an inline <script> React inserts on navigation never runs).
//   • Once loaded it cannot be unloaded, so a link from the article to any
//     page that is not an article becomes a full page load. Without that, a
//     reader who lands on a guide would carry Journey's ads onto the card and
//     price pages the decision keeps ad-free.
export const MEDIAVINE_SCRIPT_SRC =
  "https://scripts.mediavine.com/tags/b0441766-9abe-4ecb-b607-4fe0063eb39b.js";

const ARTICLE_PATH = /^\/(blog|guides)\/[^/]+\/?$/;

export function MediavineLoader() {
  useEffect(() => {
    const d = document;
    if (d.documentElement.hasAttribute(AD_FREE_ATTR)) return;
    if (!d.querySelector(`script[src="${MEDIAVINE_SCRIPT_SRC}"]`)) {
      const s = d.createElement("script");
      s.async = true;
      s.src = MEDIAVINE_SCRIPT_SRC;
      d.head.appendChild(s);
    }
    // Capture phase on document runs before Next's <Link> handler (React
    // listens on its root, below document), so stopping here keeps the router
    // out of it and the browser loads the next page fresh, without Journey.
    const leave = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || ARTICLE_PATH.test(url.pathname)) return;
      if (url.pathname === window.location.pathname && url.hash) return;
      e.preventDefault();
      e.stopPropagation();
      window.location.assign(url.href);
    };
    d.addEventListener("click", leave, true);
    return () => d.removeEventListener("click", leave, true);
  }, []);
  return null;
}
