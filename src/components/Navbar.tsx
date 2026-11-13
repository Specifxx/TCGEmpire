import Link from "next/link";
import { Suspense } from "react";
import { NavbarShell } from "./NavbarShell";
import { SearchBar } from "./SearchBar";
import { HeaderSearchSlot } from "./HeaderSearchSlot";
import { CountrySwitcher } from "./CountrySwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { NavUser } from "./NavUser";
import { GetPremiumLink } from "./GetPremiumLink";
import { BrandLogo } from "./BrandLogo";
import { HeaderMenuButton } from "./HeaderMenuButton";
import { HeaderWatchButton } from "./HeaderWatchButton";
import { CartHeaderLink } from "./cart/CartHeaderLink";
import { HeaderMegaMenu } from "./HeaderMegaMenu";
import { HEADER_MENUS } from "./nav-groups";

// THE SITE'S ONE NAVIGATION (owner, 2026-11-13: "we're making things too
// complicated … before it was simplicity that was driving it"). Until then a
// 17rem rail of ~25 links was pinned to the left of every desktop page beside
// this header, with a second ("Search features") box of its own; DECISIONS.md,
// "Minimal redesign: one navigation, a hero of words and search".
//
// One calm row, left to right:
//   • the brand (the mark; the word from xl),
//   • Database: /browse, the product's front door, at every width (owner,
//     2026-09-19/21: "that's the most important one"),
//   • the ONE card search: inline from lg, on its own full-width row below it
//     ("search for cards … should always be visible", owner 2026-09-21),
//   • the three mega menus (Singles, Sealed, Deals & market) from 1440px; from
//     lg to 1439px the row has no room for them, so the plain Sealed link stands in,
//   • Pricing (plain: Premium is offered where a free account hits a limit),
//   • theme, market, the account control, the cart list,
//   • the menu button, at EVERY width: it opens the full index
//     (CinematicNavMenu, every NAV_GROUPS link, searchable). It is the only
//     control that does (tests/single-menu-entry.test.ts).
//
// What left the row on 2026-11-13 and where it lives: Blog and Tools (the menu,
// the footer's always-visible row), the Discord icon (the footer row), the
// watchlist heart for anyone not watching a card yet (the menu's "My
// Watchlist"; it comes back, with its count, once a card is watched).
//
// WIDTHS (tests/mobile-header-fit.test.ts, header-mobile-space.test.ts measure
// the phone row; scripts/mobile-check.ts --url <dev> is the check to re-run):
//   • below sm the row is logo, Database, Pricing (from 400px), the flag (from
//     360px), the account control and the menu; the cart sits beside the search
//     one row down. Nothing in it may wrap or shrink: `whitespace-nowrap` and
//     `shrink-0` on Database and Pricing are load-bearing.
//   • from lg the search is the row's one flexible element (`min-w-0`), so the
//     right-hand cluster can stay `shrink-0` without clipping the account control.
export function Navbar() {
  return (
    <NavbarShell>
      {/* px-2 below sm: the phone row needs every pixel (see WIDTHS). max-w-[1400px]: on a very wide screen the row
          stays near the 1200px content column instead of running to the window's edges. */}
      <div className="mx-auto w-full max-w-[1400px] px-2 sm:px-6">
        <div className="flex h-16 w-full items-center justify-between gap-1 sm:gap-4">
          {/* min-w-0 (not shrink-0): on a very narrow phone the worst case is a truncated label, never a sideways-scrolling page. */}
          <div className="flex min-w-0 items-center gap-0.5 sm:gap-3 lg:flex-1">
            <Link href="/" prefetch={false} className="tap-link min-w-11 shrink-0 gap-2" aria-label="RiftCompare home">
              <BrandLogo />
              <span className="hidden text-lg font-extrabold tracking-tight text-white xl:block">
                Rift<span className="rb-flame-text">Compare</span>
              </span>
            </Link>
            <Link
              href="/browse"
              className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg px-1 text-xs font-semibold text-slate-100 hover:bg-ink-800 hover:text-white sm:px-2.5 sm:text-sm"
            >
              Database
            </Link>
            {/* Pricing on a phone and tablet (from 400px; under that the menu's own Premium entry reaches the page). */}
            <GetPremiumLink
              surface="nav:navbar"
              compact
              className="hidden min-h-11 min-w-11 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-1.5 text-xs font-semibold min-[400px]:inline-flex sm:min-w-0 sm:px-2.5 sm:text-sm lg:hidden"
            />
            {/* The card search, inline from lg (it waited for xl while the rail took 17rem of this row). lg:w-[36rem] lets it
                grow: the cluster sizes to its max-content, and min-w-0 still lets it give when the row is tight. The Suspense
                is the guard CinematicHero's comment describes; the real input is in the server HTML. */}
            <div className="hidden min-w-0 flex-1 lg:block lg:w-[36rem]">
              <HeaderSearchSlot>
                <Suspense fallback={<div className="input w-full max-w-xl" />}>
                  <SearchBar />
                </Suspense>
              </HeaderSearchSlot>
            </div>
          </div>

          <nav className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            {/* Complementary gates: the mega menus from 1440px, the plain Sealed link from lg to 1439px. */}
            <HeaderMegaMenu menus={HEADER_MENUS} className="hidden min-[1440px]:flex" />
            <Link href="/sealed" className="hidden rounded-lg px-2 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white lg:block lg:px-2.5 min-[1440px]:hidden [@media(pointer:coarse)]:py-3.5">
              Sealed
            </Link>
            <GetPremiumLink
              surface="nav:navbar"
              className="hidden shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-[13px] font-semibold lg:inline-flex xl:px-2.5 xl:text-sm xl:font-bold [@media(pointer:coarse)]:py-2.5"
            />
            {/* Light/dark switch, lg and up; below lg the menu carries it, in words. */}
            <ThemeToggle className="hidden lg:grid" />
            {/* The market switcher at every width from 360px (owner, 2026-09-30); under that it is in the menu's top bar. */}
            <CountrySwitcher className="hidden min-[360px]:block sm:ml-1" />
            <NavUser />
            {/* The cart list (owner, 2026-11-06): from sm here, beside the search below sm. */}
            <CartHeaderLink className="hidden text-slate-300 hover:text-white sm:inline-flex" />
            {/* The watchlist: its own control, never a badge on the menu button, and only once a card is watched. */}
            <HeaderWatchButton className="hidden sm:inline-flex" onlyWhenWatching />
            {/* LAST in the row, at every width: the one way into the full index. */}
            <HeaderMenuButton />
          </nav>
        </div>

        {/* Below lg the search has a full-width row of its own, so it is never cramped on a phone or tablet. */}
        <div className="flex items-center gap-1 pb-3 lg:hidden">
          <div className="min-w-0 flex-1">
            <HeaderSearchSlot mobile>
              <Suspense fallback={<div className="input" />}>
                <SearchBar />
              </Suspense>
            </HeaderSearchSlot>
          </div>
          <CartHeaderLink className="shrink-0 text-slate-300 hover:text-white sm:hidden" />
        </div>
      </div>
    </NavbarShell>
  );
}
