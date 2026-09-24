import Link from "next/link";
import { Suspense } from "react";
import { NavbarShell } from "./NavbarShell";
import { SearchBar } from "./SearchBar";
import { HeaderSearchSlot } from "./HeaderSearchSlot";
import { CountrySwitcher } from "./CountrySwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { NavUser } from "./NavUser";
import { PremiumNavLink } from "./PremiumNavLink";
import { DISCORD_URL } from "@/lib/site";
import { BrandLogo } from "./BrandLogo";
import { HeaderMenuButton } from "./HeaderMenuButton";
import { HeaderWatchButton } from "./HeaderWatchButton";

// NO server-side session read here: the navbar renders on every route, so a
// cookies() read would force the whole site dynamic (killing ISR). NavUser
// fetches the session client-side via /api/me and renders the notification
// bell + UserMenu from the same fetch.
export function Navbar() {
  return (
    <NavbarShell>
      {/* Full-window header (not capped at the content max-width) so the nav fits the
          whole window on wide screens. */}
      {/* px-2 below sm (was px-4, then px-3): 16px of what putting "Premium" back as
          TEXT needed, and the cheapest 8px available — it is whitespace, not a
          control. sm and up are untouched. No lg:px-8 any more (2026-09-23):
          at 1024 on touch the nav row needs 699px and px-6 leaves it 704 where
          px-8 left 688, and it lines the header up with <main>'s content edge
          (x=296 at 1024-1440). */}
      <div className="mx-auto w-full px-2 sm:px-6">
       <div className="flex h-16 w-full items-center justify-between gap-1 sm:gap-4">
        {/* Logo + the phone Premium link. The below-lg Database link used to live
            here too and was removed when HeaderMenuButton joined this row — see
            the tombstone just below. Everything the right-hand inline nav hides
            at these widths is in the menu overlay that button opens. */}
        {/* `min-w-0` + shrinkable, NOT `shrink-0`. Measured at 320-390px after the
            bottom bar's Menu tab moved into this row as HeaderMenuButton: the row
            needed 390px inside 343 at 375px and the PAGE scrolled sideways (406 in
            375). A `shrink-0` group cannot give, so the overflow had nowhere to go
            but the document. Letting this side shrink means the worst case is a
            truncated label on a very narrow phone rather than a horizontally
            scrolling site. */}
        <div className="flex min-w-0 items-center gap-0.5 sm:gap-3">
          {/* HIDDEN FROM lg UP (2026-09-21): SideNav runs the full page height
              from that breakpoint and carries the brand in its own top-left
              block, so drawing it here too put two RiftCompare marks side by
              side — and cost this row ~150px it no longer had, the rail
              having taken --sidenav-w out of the header's width. Below lg the
              rail is not rendered at all and this is still the home link. */}
          <Link href="/" className="tap-link min-w-11 shrink-0 gap-2 lg:hidden" aria-label="RiftCompare home">
            <BrandLogo />
            {/* THE WORDMARK WAITS FOR lg (was sm). Measured at 640px: this link is
                151px with the word, 48px as the mark alone — 103px, and the
                640-1023px band needed 77px once Database came back. It is the
                only thing in this row that is decoration rather than a
                destination: the mark beside it is still the home link, still the
                brand, and still tappable. The word returns at lg where the row
                has the width for it. */}
            <span className="hidden text-lg font-extrabold tracking-tight text-white lg:block">
              Rift<span className="text-brand-400">Compare</span>
            </span>
          </Link>
          {/* BROWSE — ONE LINK, VISIBLE AT EVERY WIDTH. Reported as "the database
              button is gone on mobile phone, that's the most important one" and
              then "bring it back completely on desktop as well, this is a big
              issue".
              It had been removed below lg to buy ~76px when HeaderMenuButton
              replaced the deleted bottom bar, on the reasoning that the search box
              one row down submits to /browse anyway. That reasoning was wrong about
              what the link is FOR: /browse is the product's primary destination, and
              a search box is not a substitute for a visible way in. Worse, the
              surviving copy was gated `lg:block`, so the whole 640-1023px band —
              every tablet and every narrow laptop window — had no Database link at
              all, which is the "gone on desktop" half of the report.
              Now ungated and in the left cluster beside the logo, so there is no
              width where it can disappear and no second copy to drift.

              LABELLED "Database". This label has now been argued both ways by
              the same owner within 48 hours, so the history is worth keeping:
              it said "Database" for its whole life, was renamed to "Browse" on
              2026-09-19 ("it's meant to be the browse button on the header"),
              and was renamed back on 2026-09-21 ("reword the browse in the home
              page and all other areas to database — I think that's better").
              The destination (/browse) never moved for either rename.

              This time the rename is NOT isolated to the header: the same pass
              took the word out of every label whose destination is this page,
              so the header now agrees with the menu overlay, the ⌘K launcher,
              the side rail and the footer (all of which already said "Card
              Database") and with the homepage hero link. That was the actual
              defect behind both complaints — one destination wearing two names
              depending on which control you reached it from.

              WIDTH NOTE: "Database" is ~15px wider than "Browse", and the
              640-1023px header row is the tight one (see
              tests/mobile-header-fit.test.ts and header-mobile-space.test.ts,
              which measure it). The slack the 09-19 rename banked is spent
              again here; those tests are the guard. */}
          {/* UNGATED AGAIN (2026-09-21, owner: "lets bring back the Database
              ... on the header"). It was briefly `lg:hidden` on the reasoning
              that the rail carried the same route; the rail's own search is a
              FEATURE search now, so the header is where you reach the card
              database and the card search, side by side. Ungated is also the
              only arrangement with no gap — see tests/mobile-header-fit.ts,
              which has caught a complementary-gates hole here once already. */}
          <Link
            href="/browse"
            className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg px-1 text-xs font-semibold text-slate-100 hover:bg-ink-800 hover:text-white sm:px-2.5 sm:text-sm"
          >
            Database
          </Link>
          {/* Premium, on phones, sitting next to Database (2026-09-10, owner
              brief). The desktop "✦ Premium" link further down is gated xl:block,
              so before this a phone visitor could only reach Premium through the
              menu overlay — see CinematicNavMenu's spotlight banner, which
              stays as the in-menu answer. Same lg:hidden band and same shape as
              Database above so the two read as one pair, but gold and shimmering
              because the brief is specifically that this one should stand out.
              The shimmer lives on the inner span, NOT this link: .premium-shimmer
              uses background-clip:text, which would clip the hover background to
              the glyphs if both sat on the same element. */}
          {/* `whitespace-nowrap` IS LOAD-BEARING, and the reason is worth keeping.
              Once the watchlist got its own control, this row carried five
              targets below lg and the shrinkable left cluster absorbed the extra
              44px by WRAPPING this label — "✦" on one line, "Premium" on the
              next, which looks like a broken header. No measurement caught it:
              scrollWidth/clientWidth are equal when text wraps rather than
              clips, so it took a screenshot. Nowrap forces the row to find the
              space instead, which the icon-only band below does.

              ICON-ONLY BELOW sm, full "✦ Premium" from sm up. At 375px the row's
              budget is 343px and nowrap needed ~367; dropping to the bare gold
              star saves ~40px and it fits with room. This is also the coherent
              reading of the row — on a phone every other control here is already
              an icon (market flag, account, watchlist, menu), so a lone label was
              the odd one out. The glyph keeps the gold, the shimmer and an
              accessible name, so the 2026-09-10 brief ("Premium should stand out
              on phones") still holds; it is prominence by colour and motion
              rather than by width. */}
          <PremiumNavLink
            surface="nav:navbar"
            aria-label="Premium"
            title="Premium"
            className="hidden min-h-11 min-w-11 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-1.5 text-xs font-semibold text-gold hover:bg-ink-800 min-[360px]:inline-flex sm:min-w-0 sm:px-2.5 sm:text-sm lg:hidden"
          >
            <span className="premium-shimmer animate-premium-shimmer motion-reduce:animate-none">
              ✦<span className="hidden min-[400px]:inline"> Premium</span>
            </span>
          </PremiumNavLink>

          {/* CARD SEARCH, BACK IN THE HEADER AND LEFT-ALIGNED (2026-09-21,
              owner: "bring back ... the search bar 'search for cards' on the
              header, left aligned"). It sits INSIDE the left cluster, right
              after Database, rather than as the row's own middle child: the
              row is `justify-between`, so a middle child is centred, and
              "left aligned" is the instruction.

              INLINE ONLY FROM xl (2026-09-23). From 1024 the 17rem rail takes
              the header's left edge, and the shrink-0 nav beside this left the
              slot 13-78px: the input covered "Sealed" (elementFromPoint at its
              centre returned the INPUT) and its "/" hint sat on "Database".
              Below xl the full-width row underneath carries it, at 576px.
              `xl:w-[36rem]` is what lets it grow: the cluster is flex 0 1 auto,
              so it sizes to its max-content, and flex-1 alone had nothing to
              grow into — the input stuck at ~288px with 637px of empty header
              at 1920. Measured input widths after: 285 at 1280, 445 at 1440,
              576 at 1920/2560 (SearchBar's own max-w-xl caps it; min-w-0
              still lets it shrink when the row is tight).

              The rail's search is a FEATURE search now (SideNav.tsx), so this
              is the only card search in the chrome and there is no duplication
              to resolve. It is ALSO no longer scroll-gated on the homepage —
              see HeaderSearchSlot's own doc comment. */}
          {/* The <Suspense> no longer shows its fallback on a normal load —
              SearchBar stopped calling useSearchParams() on 2026-09-22 (see
              its `value` state), so the real input is in the server HTML.
              Kept as the guard CinematicHero's comment describes. */}
          <div className="hidden min-w-0 flex-1 xl:block xl:w-[36rem]">
            <HeaderSearchSlot>
              <Suspense fallback={<div className="input w-full max-w-xl" />}>
                <SearchBar />
              </Suspense>
            </HeaderSearchSlot>
          </div>
        </div>


        {/* Nav.
            ── BREAKPOINTS, and why they are what they are ───────────────────
            This row overflowed horizontally across roughly 640-790px: measured
            with a real browser, it needed 738px of content in a 720px box at
            768px wide. Nothing here can shrink to absorb it — the search bar,
            the only flexible element, waits for xl before it goes inline — so
            the row had no slack at all and the page scrolled sideways on every
            tablet. scripts/mobile-check.ts audits 375px only, which is why it
            never surfaced.

            FROM lg TO xl THIS ROW HAS NO FLEXIBLE ELEMENT (2026-09-23). The
            inline search moved to xl, so the left cluster is just Database,
            and the row is 704px at 1024 against a 559px (mouse) or 595px
            (touch) nav — it fits, but with only ~5px of slack on touch.

            The fix is what the phone Menu overlay exists for, applied in order of
            how navigational each item is:
              • below lg — logo, Database, Explore, Marketplace, country.
              • from lg  — everything else at once: the navigation links (Sealed,
                Decks, Blog), Database moving into this row, the
                Premium upsell (96px, opens a dialog) and the Discord icon (36px,
                external).
            Everything hidden at a given width is in the Menu overlay (opened by
            HeaderMenuButton below lg) via nav-groups.ts, and Discord is in the
            footer, so no link is lost.

            THE NAV LINKS MOVED md → lg, and the reason is worth keeping: `md`
            put them on screen from 768px, but the SEARCH BAR — the only element
            here that can flex and absorb slack — does not appear until `lg`
            (1024px). That left 768-1023px as a band carrying every link with
            nothing able to give, and it overflowed: measured at 790px, the
            document was 818px wide before the signed-out CTA was widened to
            "Log in / Sign up" and 869px after. Tying the links to the same
            breakpoint as the flexible search bar means the row never carries
            them without something able to absorb the difference. (Since
            2026-09-23 the search waits for xl, so from lg to xl the links ride
            without it — see the note above for why they still fit.)
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
          {/* ⌘K MOVED sm -> lg, 2026-09-18. It is a KEYBOARD affordance, and below
              lg the menu button at the end of this row now does the same job for a
              touch device — CinematicNavMenu opens with its own search box over the
              same NAV_GROUPS the launcher searches. Two controls for one job is
              exactly the duplication this header keeps being pruned of, and at
              640-1023px the row could no longer afford both: with the watchlist
              split out of the menu button, its intrinsic width was ~641px inside
              592, which `min-w-0` turned from a scrolling page into the Premium
              label being overdrawn by the theme toggle. */}
          {/* Was `hidden lg:inline-flex` — i.e. lg-and-up only, which is
              precisely where the rail's own Search row now opens the same
              launcher. Removed rather than re-gated for that reason. */}
          {/* The desktop-only Database copy that used to sit here is GONE — not the
              link, the DUPLICATE. It was `lg:block` while the other was
              `lg:hidden`, so the two never appeared together and the pair left
              640-1023px with neither. One ungated link in the left cluster now
              covers every width, which is the only arrangement with no gap. */}
          {/* Sealed products — high-AOV, right after the database. */}
          {/* ── The desktop nav links, RESTORED 2026-09-21 ────────────────
              These were removed earlier the same day, when the full-height
              rail arrived, on the reasoning that the rail carries every one of
              them. The owner's answer was that the header stays and should
              simply be shorter: "I still want the sealed, the blog, premium,
              Discord, the watch list, the light and dark mode, the country and
              the accounts."

              So this row is a CURATED shortlist, not a second copy of the
              rail: the two links worth one click from anywhere (Sealed, Blog),
              plus the account-shaped chrome the rail does not carry. What
              stayed deleted is what the owner named — Explore, Deck builder,
              Auctions — plus the brand, the inline search box and the ⌘K
              button, which the rail now owns outright. */}
          {/* `[@media(pointer:coarse)]:py-3.5` on these three (2026-09-23): as
              plain `py-2` blocks they were 36px tall on a touch tablet at 1024
              (69/69 pages audited), under the 48px coarse floor globals.css
              gives every other control. 20px line + 28px padding = 48px on
              touch; a mouse keeps the 36px row. The row is h-16, so the header
              height does not change. */}
          <Link href="/sealed" className="hidden rounded-lg px-2 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white lg:block lg:px-2.5 [@media(pointer:coarse)]:py-3.5">
            Sealed
          </Link>
          <Link href="/blog" className="hidden rounded-lg px-2 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white lg:block lg:px-2.5 [@media(pointer:coarse)]:py-3.5">
            Blog
          </Link>
          <PremiumNavLink className="hidden rounded-lg px-2 py-2 text-sm font-semibold text-gold hover:bg-ink-800 lg:block lg:px-2.5 [@media(pointer:coarse)]:py-3.5" surface="nav:navbar">
            ✦ Premium
          </PremiumNavLink>

          {/* Deck builder — the free "paste a list, price every card" tool. This
              slot held "Decks" (/decks, the meta-deck hub) until 2026-09-12; that
              surface was ten hand-typed lists presented as the metagame and was
              removed outright, with /decks/* redirecting to the builder
              (DECISIONS.md, "Meta decks: removed"). The builder keeps the slot
              because it is something every visitor can act on immediately, which
              is the bar for a header link — and it keeps /deck one click from
              every price page rather than launcher/footer-only.

              Sits after Sealed rather than before it: Sealed is the deliberate
              high-AOV slot next to the database (see above).

              Trade Calculator used to occupy this slot and was removed on
              purpose; it is still in the launcher, mega-menu and footer via the
              same "Decks" group in nav-groups.ts, so /trade keeps its internal
              links and does not become an orphan. */}

          {/* Best Basket USED TO sit here (a header link, added when the tool was
              free with any account — see its own git history for why). Removed
              when Best Basket moved back to the Premium tier: a header-level slot
              is for something every visitor can act on immediately, not a tool
              most visitors would just bounce off a paywall for. It's still
              reachable from the ⌘K launcher, the mega-menu, /tools and its own
              contextual links (deck pages, card pages, etc.) via nav-groups.ts —
              nothing became an orphan, it just lost the one slot that implied
              "free to everyone". */}
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

          {/* Auctions — the live eBay auction board. At xl, not lg, for the same
              reason Premium and Discord below are: the lg row is already at the
              width that overflowed on tablets once (the 640-790px fix, see
              scripts/mobile-check.ts) and a sixth lg item walks back toward it.
              Below xl it is one keystroke away in the ⌘K launcher, in the phone
              Explore overlay, in the side rail and in the footer — it is in the
              Prices group in nav-groups.ts, so all four get it from one entry. */}

          {/* The P2P marketplace was removed entirely (2026-08) — the site is
              back to pure price comparison — so there is no Marketplace chip
              here, and Premium (below) is the header's only always-visible,
              non-deferred nav item besides the logo and Database. That keeps
              the above-the-fold interactive-target budget (scripts/homepage-
              audit.mjs) comfortably in range. */}
          {/* Premium — straight to the full pricing page, not the upsell dialog
              (2026-09-06: the dialog is retired as a navigation entry point —
              see PremiumButton's own header for where it's still used).
              At xl, not lg: see the Discord icon below for the shared reason. */}

          {/* Single nav entry point, and it is still exactly one at every width.
              From lg the ⌘K "Explore" command launcher (above) is the full-nav
              surface — it lists the same NAV_GROUPS searchably — so there is no
              separate "Menu" dropdown. Below lg the one control is
              HeaderMenuButton at the end of this row, which opens the same
              CinematicNavMenu overlay through the same useMegaMenu()/setOpen.
              "We have the menu, but we also have the menu on the top right… we
              only need one of them" was reported directly and still holds; the
              surviving copy simply moved back up here when the bottom tab bar
              that had been hosting it was deleted. */}
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
            className="tap-icon hidden rounded-lg text-slate-300 transition-colors hover:bg-ink-800 hover:text-[#5865F2] lg:grid"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.249.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.369a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          </a>
          {/* Light/dark switch, lg and up (was sm, moved 2026-09-18 for the same
              width reason as ⌘K above). CinematicNavMenu already carries a
              "Theme — Dark · tap to switch" row, so below lg this is a second
              copy of a control the overlay owns, and the overlay's version reads
              its state in words rather than as an ambiguous glyph. */}
          <ThemeToggle className="hidden lg:grid" />
          {/* Below sm the market switcher lives in the menu overlay's top bar
              (CinematicNavMenu), 2026-09-24: the signed-out row now carries
              "Log in" + "Sign up free" at every width, and the market is
              auto-detected from the visitor's IP, which makes the switcher the
              least-used control in the row. */}
          <CountrySwitcher className="hidden sm:ml-1 sm:block" />
          <NavUser />
          {/* THE PHONE/TABLET MENU, BACK IN THE HEADER. Below lg only — from lg
              the ⌘K launcher above is the full-nav surface and the SideNav rail
              takes over, so this would be a third entry point at a width that
              already has two. Still exactly ONE control opening the overlay at
              any given width, which is what tests/single-menu-entry.test.ts
              pins; what changed is that the one control is here rather than in
              a fixed bottom bar, because that bar could not be kept pinned to
              the bottom of a phone screen across three attempts (see
              HeaderMenuButton.tsx). LAST in the row, so it sits at the screen's
              right edge — the nearest thing to a thumb that a top bar has. */}
          {/* WATCHLIST, ITS OWN CONTROL — deliberately not a badge on the menu
              button next to it. A count belongs to the thing it counts: tapping
              it has to land on /watching, and a menu button that sometimes wears
              a number reads as unread navigation. "The watchlist and the menu
              should be separate." Below lg only, like the menu: from lg the
              SideNav rail already lists "My Watchlist" from NAV_GROUPS (no
              count there — the rail renders links, not live state) and the
              launcher finds it, so a third control would be the duplication
              this header keeps being pruned of. */}
          {/* WATCHLIST FROM sm UP, not below it. Bringing Database back (the
              explicit priority: "that's the most important one") put seven
              controls in this row, and at 320-414px they measurably overlapped —
              Premium and Database drawn through the market switcher. Removing
              the notification bell paid for part of it but only from sm up,
              where that bell already lived.
              The watchlist is the cheapest of the remaining 48px: below sm it
              is one tap away in the menu overlay, whereas Database and Premium
              were both named as must-haves and the market switcher, account and
              menu are each the only route to something. It stays a SEPARATE
              control from the menu at every width it appears, which is what
              "the watchlist and the menu should be separate" actually asked
              for. */}
          <HeaderWatchButton className="hidden sm:inline-flex" />
          <HeaderMenuButton className="lg:hidden" />
        </nav>
       </div>

        {/* Search gets its own full-width row below xl (so it's never cramped
            on phones/tablets). Below xl, not lg (2026-09-23): from 1024 the
            17rem rail left the inline slot 13-78px, and the input covered
            "Sealed". The header is therefore 121px (mouse) or 125px (touch)
            from 1024 to 1279, and 65px from 1280. HeaderSearchSlot's `mobile`
            variant no longer scroll-gates this row on the homepage (it did,
            alongside the desktop row, until 2026-09-21) — see that
            component's own doc comment for why both rows are now always
            visible. */}
        <div className="pb-3 xl:hidden">
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
