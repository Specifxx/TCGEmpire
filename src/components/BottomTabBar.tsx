"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon, type NavIconName } from "./NavIcon";
import { focusCardSearch } from "@/lib/search-focus";
import { useMegaMenu } from "./MegaMenuProvider";
import { useWatchlist } from "@/lib/use-watchlist";

// SideNav's complement below `lg` — the rail is `hidden lg:flex`, this is
// `lg:hidden`, one breakpoint decision either way (see --bottombar-h /
// --sidenav-w in globals.css, which are never allowed to disagree). Five
// fixed targets, so the active-tab indicator is plain CSS math (translateX in
// 20% steps) rather than the measured, arbitrary-width version ui/SegmentedTabs
// needs for a tab COUNT that isn't fixed.
const TABS: { label: string; icon: NavIconName; href?: string }[] = [
  { label: "Home", icon: "home", href: "/" },
  // Focuses the header's CARD search (cards + sealed products), not the ⌘K
  // command launcher this used to open. The launcher searches pages and tools,
  // and said so itself: "to look up a card, use the search box in the header".
  // On a phone that is the wrong tool behind the one button most likely to be
  // pressed — reported directly: "the search bar at the bottom … should be
  // searching through the card pages, not the features".
  { label: "Search", icon: "browse" },
  { label: "Watch", icon: "bell", href: "/watching" },
  { label: "Binder", icon: "collection", href: "/portfolio" },
  { label: "Menu", icon: "menu" },
];

export function BottomTabBar() {
  const pathname = usePathname();
  const { setOpen: setMenuOpen, open: menuOpen } = useMegaMenu();
  const { watched } = useWatchlist();
  const watchCount = watched?.size ?? 0;

  // Only a real PAGE match lights up the sliding indicator — Search and Menu
  // open overlays, they are never the "current page".
  const activeIndex = TABS.findIndex((t) => t.href && (t.href === "/" ? pathname === "/" : pathname?.startsWith(t.href)));

  return (
    <nav
      aria-label="Primary"
      // `bottom` is STATIC (native-banner-h only — that changes once, on native
      // app detection, never mid-scroll). The chrome-lift compensation moves
      // through `translateY` instead, on its own line below, and that split is
      // the whole fix for a second bug this bar shipped with.
      //
      // Reported on a Z Fold 7 (cover screen): "the bottom is glitched … should
      // not be able to move or lag when I scroll down." The previous version
      // put --chrome-lift straight into `bottom`, and `bottom` is a LAYOUT
      // property — every recalculation of that calc() (and dvh/lvh are
      // deliberately DYNAMIC, so the browser recomputes them continuously while
      // its own chrome animates) forced a full reflow of this element, PLUS a
      // repaint of `backdrop-blur` at its new position, on every single frame
      // of that animation. Layout thrash plus a backdrop-filter repaint on
      // every frame is a textbook jank source — web.dev's own performance
      // guidance is to animate `transform`/`opacity` and nothing else, for
      // exactly this reason. A foldable's chrome is also one of the more
      // unusual/actively-changing ones out there, so it is a plausible
      // candidate for showing this worst.
      //
      // `translate-y-[calc(var(--chrome-lift)*-1)]` carries the identical
      // value but as a compositor-only transform: the browser can reposition
      // the already-painted layer on the GPU without touching layout or
      // repainting the page underneath. `will-change-transform` asks the
      // browser to promote this to its own layer up front rather than
      // discovering the need mid-animation, which is when a promotion itself
      // can cause a visible hitch.
      className="fixed inset-x-0 bottom-[var(--native-banner-h)] z-bottombar flex h-[var(--bottombar-h)] translate-y-[calc(var(--chrome-lift)*-1)] will-change-transform border-t border-ink-800 bg-ink-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {activeIndex >= 0 && (
        <span
          aria-hidden="true"
          className="motion-safe:transition-transform motion-safe:duration-base motion-safe:ease-out absolute left-0 top-0 h-0.5 w-1/5 bg-brand-400"
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
        />
      )}

      {TABS.map((tab) => {
        const isActive = tab.href ? (tab.href === "/" ? pathname === "/" : pathname?.startsWith(tab.href)) : tab.label === "Menu" && menuOpen;
        const cls = `relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 ${
          isActive ? "text-brand-400" : "text-slate-300"
        }`;

        const content = (
          <>
            <span className="relative">
              <NavIcon name={tab.icon} className="h-5 w-5" />
              {tab.label === "Watch" && watchCount > 0 && (
                <span className="num absolute -right-1.5 -top-1 grid h-3.5 min-w-[14px] place-items-center rounded-full bg-accent px-0.5 text-[9px] font-bold text-ink-950">
                  {watchCount > 9 ? "9+" : watchCount}
                </span>
              )}
            </span>
            <span className="text-[10px] font-medium">{tab.label}</span>
          </>
        );

        if (tab.href) {
          return (
            <Link key={tab.label} href={tab.href} aria-current={isActive ? "page" : undefined} className={cls}>
              {content}
            </Link>
          );
        }

        return (
          <button
            key={tab.label}
            type="button"
            onClick={() => (tab.label === "Search" ? focusCardSearch() : setMenuOpen(true))}
            className={cls}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}
