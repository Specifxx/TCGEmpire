import Link from "next/link";
import { Suspense } from "react";
import { NavbarShell } from "./NavbarShell";
import { CommandLauncherButton } from "./CommandLauncher";
import { SearchBar } from "./SearchBar";
import { MobileNav } from "./MobileNav";
import { CountrySwitcher } from "./CountrySwitcher";
import { NavUser } from "./NavUser";
import { PremiumButton } from "./PremiumButton";
import { DISCORD_URL } from "@/lib/site";
import { MARKETPLACE_NAV_VISIBLE } from "./nav-groups";

// NO server-side session read here: the navbar renders on every route, so a
// cookies() read would force the whole site dynamic (killing ISR). NavUser
// fetches the session client-side via /api/me and renders the notification
// bell + UserMenu from the same fetch.
export function Navbar() {
  return (
    <NavbarShell>
      {/* Full-window header (not capped at the content max-width) so the nav fits the
          whole window on wide screens. */}
      <div className="mx-auto w-full px-4 sm:px-6 lg:px-8">
       <div className="flex h-16 w-full items-center justify-between gap-2 sm:gap-4">
        {/* Logo + the primary Database link, kept together on the left. On phones the
            right-hand inline nav collapses into the hamburger, so the Database tab lives
            here in the header's open space instead. */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="RiftCompare home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-r-green.png" alt="RiftCompare logo" width={359} height={353} className="h-9 w-auto" />
            <span className="hidden text-lg font-extrabold tracking-tight text-white sm:block">
              Rift<span className="text-brand-400">Compare</span>
            </span>
          </Link>
          <Link href="/browse" className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-200 hover:bg-ink-800 hover:text-white lg:hidden">
            Database
          </Link>
        </div>

        {/* Search — inline on desktop; on smaller screens it gets its own full-width row below */}
        <div className="hidden flex-1 lg:block">
          <Suspense fallback={<div className="input max-w-xl" />}>
            <SearchBar />
          </Suspense>
        </div>

        {/* Nav */}
        <nav className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {/* Command launcher — every page can reach every page from here (⌘K). */}
          {/* Inline text/⌘K nav is desktop-only — on phones it overflowed the bar
              (worse once the logged-in avatar showed). Everything here is reachable
              from the hamburger pop-up menu, so hide it below sm. */}
          <span className="hidden sm:inline-flex">
            <CommandLauncherButton />
          </span>
          {/* Database is beside the logo on smaller screens; keep it in the right nav on desktop. */}
          <Link href="/browse" className="hidden rounded-lg px-2 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white sm:px-2.5 lg:block">
            Database
          </Link>
          {/* Sealed products — high-AOV, right after the database. */}
          <Link href="/sealed" className="hidden rounded-lg px-2 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white sm:block sm:px-2.5">
            Sealed
          </Link>
          {/* Trade Calculator — front-and-centre so players can reach it fast at locals. */}
          <Link href="/trade" className="hidden rounded-lg px-2 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white sm:block sm:px-2.5">
            Trade
          </Link>
          {/* Marketplace — filled brand chip (not a plain text link) so the newly
              launched P2P marketplace is the most visually loud thing in the bar
              besides the logo. Only appears once MARKETPLACE_NAV_VISIBLE (mirrors
              NEXT_PUBLIC_MARKETPLACE_PUBLIC). */}
          {MARKETPLACE_NAV_VISIBLE && (
            <Link
              href="/marketplace"
              className="hidden items-center gap-1.5 rounded-lg bg-brand-500 px-2.5 py-2 text-sm font-bold text-ink-950 shadow-sm transition-colors hover:bg-brand-400 sm:flex"
            >
              🛒 Marketplace
              <span className="rounded bg-ink-950/20 px-1 py-0.5 text-[9px] font-extrabold uppercase tracking-wide">Beta</span>
            </Link>
          )}
          {/* Premium — one-click into the upsell dialog from anywhere. */}
          <PremiumButton className="hidden rounded-lg px-2 py-2 text-sm font-semibold text-gold hover:bg-ink-800 sm:block sm:px-2.5">
            ✦ Premium
          </PremiumButton>
          {/* Single nav entry point: the ⌘K "Explore" command launcher (above) is the
              full-nav surface on desktop — it lists the same NAV_GROUPS searchably — so
              the separate "Menu" mega-dropdown is gone (matches DexCompare's one-tab model). */}
          {/* Join our Discord — opens the permanent invite in a new tab */}
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Join our Discord"
            title="Join our Discord"
            className="hidden h-9 w-9 place-items-center rounded-lg text-slate-300 transition-colors hover:bg-ink-800 hover:text-[#5865F2] sm:grid"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.249.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.369a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          </a>
          <CountrySwitcher className="ml-0.5 sm:ml-1" />
          <NavUser />
          <MobileNav />
        </nav>
       </div>

        {/* Search gets its own full-width row below the lg breakpoint (so it's
            never cramped on phones/tablets). */}
        <div className="pb-3 lg:hidden">
          <Suspense fallback={<div className="input" />}>
            <SearchBar />
          </Suspense>
        </div>
      </div>
    </NavbarShell>
  );
}
