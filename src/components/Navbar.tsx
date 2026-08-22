import Link from "next/link";
import { Suspense } from "react";
import { NavbarShell } from "./NavbarShell";
import { CommandLauncherButton } from "./CommandLauncher";
import { SearchBar } from "./SearchBar";
import { HeaderSearchSlot } from "./HeaderSearchSlot";
import { MobileNav } from "./MobileNav";
import { CountrySwitcher } from "./CountrySwitcher";
import { NavUser } from "./NavUser";
import { PremiumButton } from "./PremiumButton";
import { DISCORD_URL } from "@/lib/site";
import { BrandLogo } from "./BrandLogo";

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
          <Link href="/" className="tap-link min-w-11 shrink-0 gap-2" aria-label="RiftCompare home">
            <BrandLogo />
            <span className="hidden text-lg font-extrabold tracking-tight text-white sm:block">
              Rift<span className="text-brand-400">Compare</span>
            </span>
          </Link>
          <Link href="/browse" className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm font-semibold text-slate-200 hover:bg-ink-800 hover:text-white lg:hidden">
            Database
          </Link>
        </div>

        {/* Search — inline on desktop; on smaller screens it gets its own full-width row below.
            HeaderSearchSlot hides this specific box until scroll, but ONLY on the
            homepage (see its own doc comment) — every other route renders it
            immediately, unchanged from before. */}
        <HeaderSearchSlot>
          <Suspense fallback={<div className="input max-w-xl" />}>
            <SearchBar />
          </Suspense>
        </HeaderSearchSlot>

        {/* Nav.
            ── BREAKPOINTS, and why they are what they are ───────────────────
            This row overflowed horizontally across roughly 640-790px: measured
            with a real browser, it needed 738px of content in a 720px box at
            768px wide. Nothing here can shrink to absorb it — the search bar,
            the only flexible element, is itself hidden below lg — so the row had
            no slack at all and the page scrolled sideways on every tablet.
            scripts/mobile-check.ts audits 375px only, which is why it never
            surfaced.

            The fix is what the hamburger exists for, applied in order of how
            navigational each item is:
              • below lg — logo, Database, Explore, Marketplace, country, burger.
              • from lg  — everything else at once: the navigation links (Sealed,
                Decks, Best Basket, Blog), Database moving into this row, the
                Premium upsell (96px, opens a dialog) and the Discord icon (36px,
                external).
            Everything hidden at a given width is in the hamburger via
            nav-groups.ts, and Discord is in the footer, so no link is lost.

            THE NAV LINKS MOVED md → lg, and the reason is worth keeping: `md`
            put them on screen from 768px, but the SEARCH BAR — the only element
            here that can flex and absorb slack — does not appear until `lg`
            (1024px). That left 768-1023px as a band carrying every link with
            nothing able to give, and it overflowed: measured at 790px, the
            document was 818px wide before the signed-out CTA was widened to
            "Log in / Sign up" and 869px after. Tying the links to the same
            breakpoint as the flexible search bar means the row never carries
            them without something able to absorb the difference.
            Measured after: 691px at 790, no overflow at 640/720/790/1280.
            scripts/mobile-check.ts --url <dev> is the check to re-run after
            touching anything in this row. */}
        <nav className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {/* This whole group (⌘K through Blog), the sign-in control, and the
              other secondary chrome below used to be gated behind
              HomeHeaderReveal — hidden pre-scroll on "/" alone, in service of
              a "≤12 interactive elements above the fold" homepage-redesign
              target. Reverted: hiding the sign-in control specifically was
              undercutting the signup funnel this same codebase spent real
              effort instrumenting and fixing elsewhere (see the Phase 0-2
              signup-growth work) — a visitor who never scrolls never sees a
              way to sign in at all. The whole nav is unconditionally visible
              on every route now, homepage included. */}
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
          <Link href="/sealed" className="hidden rounded-lg px-2 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white lg:block lg:px-2.5">
            Sealed
          </Link>
          {/* Decks — the hub for the metagame surface: 10 real tournament lists,
              each priced live, plus the archetype/domain landing pages under
              /decks/archetype/* and /decks/domain/*. It was reachable only from
              the ⌘K launcher, the mega-menu and the footer, which put the whole
              deck surface two clicks from every price page and left the nine new
              landing pages depending on one hub nothing in the header linked.
              Sits after Sealed rather than before it: Sealed is the deliberate
              high-AOV slot next to the database (see above), and this is the
              next-strongest commercial intent after it.

              Trade Calculator used to occupy this slot and was removed on
              purpose; it is still in the launcher, mega-menu and footer via the
              same "Decks" group in nav-groups.ts, so /trade keeps its internal
              links and does not become an orphan.

              md:block, alongside Sealed and Blog — see the breakpoint note at the
              top of this nav. It shipped at lg:block first, only because the row
              was overflowing at the time and this link must not make a live bug
              worse; now that the row fits, it belongs with the other navigation
              links. */}
          <Link href="/decks" className="hidden rounded-lg px-2 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white lg:block lg:px-2.5">
            Decks
          </Link>
          {/* Best Basket — the multi-store cart optimiser (cheapest way to buy
              several cards, postage included). Previously reachable only from
              the ⌘K launcher, the mega-menu, /tools and a handful of contextual
              links — never from the header, never from the homepage — despite
              being the hardest feature in this category to replicate (it needs
              per-store shipping data, not just prices) and the highest-intent
              moment it answers ("I have a list, what's the cheapest way to buy
              it") having no header presence at all. Same md:block treatment as
              Sealed/Decks/Blog. */}
          <Link href="/tools/best-basket" className="hidden rounded-lg px-2 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white lg:block lg:px-2.5">
            Best Basket
          </Link>
          {/* Blog — the header's one link into our own writing. It exists because
              the hand-written content was previously reachable only from the
              footer and the mega-menu, which made the only genuinely original
              material on the site invisible to anyone arriving on a price page;
              an AdSense reviewer sampling from the homepage has to find the
              editorial in one click. This slot used to point at /guides under the
              label "Guides & News"; /blog is the livelier half (news, spoilers,
              meta snapshots — the pages that change weekly) and it carries a
              "Browse the guides" link of its own, so /guides is still one hop
              from the header rather than buried. */}
          <Link href="/blog" className="hidden rounded-lg px-2 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white lg:block lg:px-2.5">
            Blog
          </Link>
          {/* NO Marketplace chip here, deliberately (removed 2026-08-17, before
              this phase's own homepage-decluttering pass — the two changes
              are independent and both still hold). The P2P marketplace needs
              liquidity, and liquidity needs the traffic this site does not
              yet have — a two-sided market that can't clear is a worse first
              impression than no market at all, and the header is the single
              most valuable acquisition surface on the site. This is a
              NAV-ONLY change: /marketplace and every seller-management route
              (orders, funds, dashboard) stay fully live and linked from the
              footer and UserMenu, so a seller with an in-flight order or a
              pending payout keeps normal access — nothing here strands
              anyone's money. MARKETPLACE_NAV_VISIBLE (nav-groups.ts) still
              gates the mega-menu/⌘K "Buy on Marketplace" group and the
              footer legal links; only the primary header chip is gone
              unconditionally. (This also means Premium — see below — is now
              the header's only always-visible, non-deferred nav item besides
              the logo and Database, which only helps the above-the-fold
              interactive-target budget scripts/homepage-audit.mjs checks.) */}
          {/* Premium — one-click into the upsell dialog from anywhere.
              At xl, not lg: see the Discord icon below for the shared reason. */}
          <PremiumButton className="hidden rounded-lg px-2 py-2 text-sm font-semibold text-gold hover:bg-ink-800 xl:block xl:px-2.5">
            ✦ Premium
          </PremiumButton>
          {/* Single nav entry point: the ⌘K "Explore" command launcher (above) is the
              full-nav surface on desktop — it lists the same NAV_GROUPS searchably — so
              the separate "Menu" mega-dropdown is gone (matches DexCompare's one-tab model). */}
          {/* Discord, the region switcher and the sign-in control (NavUser) —
              always visible now, see the doc comment above this nav's opening
              tag for why the prior pre-scroll hiding on "/" was reverted. A
              signed-out visitor on the homepage sees the same "Sign in" the
              rest of the site shows, from the very first paint. */}
          {/* Join our Discord — opens the permanent invite in a new tab.
              AT xl, NOT lg — same for the Premium button above. Once every nav
              link turns on at lg, the row's intrinsic minimum was ~1056px, so
              between 1024 and ~1056 the signed-out CTA was silently CLIPPED by
              the container (no page scroll, so the overflow sweep never caught
              it — it just cut "Log in / Sign up" down to "Log"). These two are
              the row's only non-navigational items — Premium opens a dialog,
              Discord leaves the site — so deferring them to xl is the cheapest
              ~132px, and both remain reachable meanwhile: Premium from the
              UserMenu and /premium, Discord from the footer. */}
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Join our Discord"
            title="Join our Discord"
            className="tap-icon hidden rounded-lg text-slate-300 transition-colors hover:bg-ink-800 hover:text-[#5865F2] xl:grid"
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
            never cramped on phones/tablets). HeaderSearchSlot's `mobile`
            variant scroll-gates this exactly like the desktop row above,
            but ONLY on the homepage — see that component's own doc comment
            for why the hero's own always-visible mobile search box makes
            this safe (nowhere loses search access) and necessary (the hard
            target for zero duplicate search boxes above the fold has no
            mobile carve-out). */}
        <div className="pb-3 lg:hidden">
          <HeaderSearchSlot mobile>
            <Suspense fallback={<div className="input" />}>
              <SearchBar />
            </Suspense>
          </HeaderSearchSlot>
        </div>
      </div>
    </NavbarShell>
  );
}
