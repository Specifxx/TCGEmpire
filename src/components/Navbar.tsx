import Link from "next/link";
import { Suspense } from "react";
import { SearchBar } from "./SearchBar";
import { NavWishlistButton } from "./NavWishlistButton";
import { MobileNav } from "./MobileNav";
import { NavDropdown } from "./NavDropdown";
import { CountrySwitcher } from "./CountrySwitcher";
import { UserMenu } from "./UserMenu";
import { WishlistSync } from "./WishlistSync";
import { getCurrentUser } from "@/lib/auth";

export async function Navbar() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-950/95">
      <WishlistSync loggedIn={!!user} />
      <div className="container-app">
       <div className="flex h-16 items-center gap-4">
        {/* Logo: standalone R mark + text wordmark */}
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="RiftCompare home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-r-green.png" alt="" aria-hidden className="h-9 w-auto" />
          <span className="hidden text-lg font-extrabold tracking-tight text-white sm:block">
            Rift<span className="text-brand-400">Compare</span>
          </span>
        </Link>

        {/* Search — inline on desktop; on smaller screens it gets its own full-width row below */}
        <div className="hidden flex-1 lg:block">
          <Suspense fallback={<div className="input max-w-xl" />}>
            <SearchBar />
          </Suspense>
        </div>

        {/* Nav */}
        <nav className="ml-auto flex items-center gap-1 lg:ml-0">
          <Link href="/browse" className="rounded-lg px-2.5 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white">
            Database
          </Link>
          {/* Trade Calculator — front-and-centre so players can reach it fast at locals. */}
          <Link href="/trade" className="rounded-lg px-2.5 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white">
            Trade
          </Link>
          <div className="hidden lg:block">
            <NavDropdown
              label="Decks"
              items={[
                { href: "/decks", label: "Meta Decks", desc: "Top tournament decklists" },
                { href: "/deck", label: "Deck Builder", desc: "Build & price your own" },
              ]}
            />
          </div>
          <div className="hidden lg:block">
            <NavDropdown
              label="More"
              items={[
                { href: "/forum", label: "Forum", desc: "Buy, sell & trade with players" },
                { href: "/rewards", label: "Rewards", desc: "Earn Shards & redeem perks" },
                { href: "/sealed", label: "Sealed Products", desc: "Boxes, packs & promos" },
                { href: "/proxy", label: "Proxy Printer", desc: "Pick & print test cards" },
                { href: "/guides", label: "Guides", desc: "Learn Riftbound" },
                { href: "/blog", label: "Blog", desc: "News & meta" },
              ]}
            />
          </div>
          <CountrySwitcher className="ml-1" />
          <NavWishlistButton />
          <UserMenu
            user={
              user
                ? {
                    displayName: user.displayName,
                    email: user.email,
                    avatarUrl: user.avatarUrl,
                    emailVerified: user.emailVerified,
                    balanceCents: user.balanceCents,
                    points: user.points,
                    canCheckIn: user.canCheckIn,
                  }
                : null
            }
          />
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
    </header>
  );
}
