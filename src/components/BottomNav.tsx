"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CART_OPEN_EVENT, cartCount, onCartChange, readCart } from "@/lib/cart-list";
import { CartIcon } from "./cart/CartIcon";
import { NavIcon } from "./NavIcon";
import { bottomNavEnabled, bottomNavShows, isActivePath, nextDir, NAV_H, OPT_KEY, type BottomNavMode } from "@/lib/bottom-nav";

// The phone bottom nav (owner, 2026-11-18, after Catchback's; ported from TCG Prices). READ DECISIONS.md "The mobile bottom tab bar is deleted" (2026-09-18)
// FIRST: an earlier bar rode up the screen because it tried to compute where the browser's address bar was (calc(100lvh - 100dvh), then a
// visualViewport "lift"), and floated when the visitor pinch-zoomed. THIS bar does no position arithmetic at all:
//
//   • `fixed inset-x-0 bottom-0`, the same placement the phone dock (AdDock.tsx) has run in production since 2026-11-06, with
//     `env(safe-area-inset-bottom)` padding. It moves on `transform` only (CLS 0), never `bottom`, never a measured number.
//   • Browser only (nothing in the server HTML: SEO and the first paint are untouched) and phones only (below 768px).
//   • OFF unless the visitor opts in with `?bn=1` (kept in localStorage; `?bn=0` clears it) or the site's mode is "on". The owner tries
//     it on his own phone first (DECISIONS.md, 2026-11-18). `SITE.bottomNav` is the rollback: "off" ignores everything, including ?bn=1.
//   • Hides on scroll down, shows on scroll up and at the top; hides while pinch-zoomed (the layout/visual viewport split that floated
//     the old bar), while a text field has focus (the keyboard), while any dialog, the menu or the cart drawer is open, and on a page
//     with the phone buy bar, and whenever an Add to cart button is in the strip it would cover (so it never sits on one).
//   • It and the ad dock alternate: the dock shows on scroll down (the nav is away), the nav on scroll up (the dock yields to
//     `html[data-bottomnav]`). A phone screen still holds one bar at a time.

interface Tab {
  key: string;
  label: string;
  href?: string;
  also?: string[];
  icon: ReactNode;
}

// A function, so no JSX runs when the module loads (the tests import this file before React exists globally).
const tabs = (): Tab[] => [
  { key: "home", label: "Home", href: "/", icon: <NavIcon name="home" className="h-[22px] w-[22px]" /> },
  // Rift's header search submits to the Card Database, so the Search tab goes there too.
  { key: "search", label: "Search", href: "/browse", also: ["/cards"], icon: <NavIcon name="browse" className="h-[22px] w-[22px]" /> },
  { key: "deals", label: "Deals", href: "/tools/deal-finder", also: ["/movers", "/rising"], icon: <NavIcon name="deals" className="h-[22px] w-[22px]" /> },
  { key: "cart", label: "Cart", icon: <CartIcon size={22} /> },
  { key: "menu", label: "Menu", icon: <NavIcon name="menu" className="h-[22px] w-[22px]" /> },
];


function narrowNow(): boolean {
  return window.matchMedia("(max-width: 767px)").matches;
}

export function BottomNav({ mode }: { mode: BottomNavMode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLElement>(null);

  // The opt-in, read once in the browser (never in the server HTML).
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(OPT_KEY);
    } catch {
      /* storage blocked: the query alone decides, for this page */
    }
    const r = bottomNavEnabled(mode, location.search, stored);
    if (r.store !== null) {
      try {
        localStorage.setItem(OPT_KEY, r.store);
      } catch {
        /* nothing to keep it in */
      }
    }
    setEnabled(r.enabled);
  }, [mode]);

  useEffect(() => {
    if (!enabled) return;
    const sync = () => setCount(cartCount(readCart()));
    sync();
    return onCartChange(sync);
  }, [enabled]);

  // The controller. SMOOTHNESS (owner, 2026-11-18: "a bit of lag"): the scroll path reads scrollY and nothing else (no layout reads, no
  // React state, no re-render): the show/hide is two attribute writes, and CSS moves the bar on `transform` alone. Everything that
  // needs the DOM (an open dialog, a cart button in the bar's strip) is cached and refreshed by observers, never in the scroll handler.
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current as (HTMLElement & { inert?: boolean }) | null;
    if (!el) return;
    const root = document.documentElement;
    const stripPx = NAV_H + 12;
    let dir: "up" | "down" | "" = "";
    let anchor = window.scrollY;
    let typing = false;
    let modal = false;
    let buybar = false;
    let covers = 0;
    let last: boolean | null = null;

    const apply = (show: boolean) => {
      if (show === last) return;
      last = show;
      el.dataset.bottomnavBar = show ? "shown" : "hidden";
      el.inert = !show;
      if (show) el.removeAttribute("aria-hidden");
      else el.setAttribute("aria-hidden", "true");
      root.toggleAttribute("data-bottomnav", show);
      root.style.scrollPaddingBottom = show ? `calc(${NAV_H}px + env(safe-area-inset-bottom))` : "";
    };
    const decide = () => {
      const y = Math.max(0, window.scrollY); // iOS rubber-banding reports negative values past the top
      const n = nextDir(dir, anchor, y);
      dir = n.dir;
      anchor = n.anchor;
      const vv = window.visualViewport;
      apply(
        bottomNavShows({
          enabled: true,
          narrow: narrowNow(),
          scrollY: y,
          dir,
          // Pinch-zoomed: the visual viewport is smaller than the layout one and a fixed bar is drawn at the zoomed scale.
          zoomed: !!vv && vv.scale > 1.02,
          typing,
          modal,
          buybar,
          covers: covers > 0,
        }),
      );
    };

    // Cached facts, refreshed when the DOM changes (not per scroll frame).
    const refresh = () => {
      modal =
        // The cart drawer is always in the DOM, aria-modal but inert and aria-hidden while closed: only an open one counts.
        [...document.querySelectorAll("dialog[open], [aria-modal='true']")].some((d) => !d.closest("[inert], [aria-hidden='true']")) ||
        document.body.style.overflow === "hidden" ||
        root.style.overflow === "hidden" ||
        root.matches(".capacitor-native");
      buybar = !!document.querySelector(".buybar, [data-buybar]"); // Rift's card-page buy bar is `.buybar` (CardMobileBuy)
      decide();
    };

    // An Add to cart button inside the strip along the foot of the screen: the bar stays away. An IntersectionObserver reports it
    // (no layout reads in the scroll path); its root is the viewport shrunk from the top to just that strip.
    let io: IntersectionObserver | null = null;
    const inStrip = new Set<Element>();
    const watch = () => {
      io?.disconnect();
      inStrip.clear();
      covers = 0;
      if (typeof IntersectionObserver === "undefined") return;
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) (e.isIntersecting ? inStrip.add(e.target) : inStrip.delete(e.target));
          covers = inStrip.size;
          decide();
        },
        { rootMargin: `-${Math.max(0, window.innerHeight - stripPx)}px 0px 0px 0px` },
      );
      document.querySelectorAll(".ce-cart-add, .ce-cart-inline").forEach((b) => io!.observe(b));
    };

    let frame = 0;
    const later = () => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), refresh(), watch()));
    };
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      typing = !!t?.matches?.("input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable='true']");
      decide();
    };
    const onBlur = () => {
      typing = false;
      decide();
    };
    const onResize = () => {
      watch();
      decide();
    };

    el.dataset.bottomnavBar = "hidden";
    refresh();
    watch();
    window.addEventListener("scroll", decide, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    window.visualViewport?.addEventListener("resize", decide);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    // Its own attribute writes (inert, aria-hidden) are not news.
    const mo = new MutationObserver((recs) => {
      if (recs.some((r) => !el.contains(r.target))) later();
    });
    // Two targets (observe() on the same node twice REPLACES its options): the page for what opens and closes, the body for its overflow.
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "aria-modal", "aria-hidden", "inert", "data-buybar"] });
    mo.observe(document.body, { attributes: true, attributeFilter: ["style"] });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", decide);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", decide);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      mo.disconnect();
      io?.disconnect();
      root.removeAttribute("data-bottomnav");
      root.style.scrollPaddingBottom = "";
    };
  }, [enabled, pathname]);

  // Room under the footer (set once: below the fold, so no layout shift). The padding itself is CSS (`html[data-bottomnav-on] body`
  // in globals.css), added to the native banner's reservation rather than replacing it.
  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.setAttribute("data-bottomnav-on", "");
    return () => root.removeAttribute("data-bottomnav-on");
  }, [enabled]);

  if (!enabled) return null;

  const click = (key: string) => {
    if (key === "cart") window.dispatchEvent(new CustomEvent(CART_OPEN_EVENT));
    // The header's menu button stays the ONE opener of the menu (tests/single-menu-entry.test.ts): this tab presses it.
    if (key === "menu") document.querySelector<HTMLButtonElement>("button[data-menu-button]")?.click();
  };

  return (
    <nav ref={ref} aria-label="Quick links" data-bottomnav-bar="hidden" aria-hidden="true" className="bn md:hidden">
      <ul className="bn-row">
        {tabs().map((t) => {
          const active = t.href ? isActivePath(pathname, t.href, t.also) && (t.href !== "/" || pathname === "/") : false;
          return (
            <li key={t.key} className="bn-cell">
              {t.href ? (
                <Link
                  href={t.href}
                  prefetch={false}
                  aria-current={active ? "page" : undefined}
                  data-bn={t.key}
                  className="bn-tab"
                  // The target starts loading on touch-down, a head start on the tap itself (one page, only when it is touched).
                  onPointerDown={() => router.prefetch(t.href!)}
                >
                  <span className="bn-ico">{t.icon}</span>
                  <span className="bn-label">{t.label}</span>
                </Link>
              ) : (
                <button
                  type="button"
                  data-bn={t.key}
                  aria-haspopup="dialog"
                  aria-label={t.key === "cart" && count ? `Cart, ${count} item${count === 1 ? "" : "s"}` : t.label}
                  onClick={() => click(t.key)}
                  className="bn-tab"
                >
                  <span className="bn-ico">
                    {t.icon}
                    {t.key === "cart" && count > 0 && (
                      <span aria-hidden="true" className="bn-badge">
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </span>
                  <span className="bn-label">{t.label}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
