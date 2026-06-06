import Link from "next/link";
import { Suspense } from "react";
import { SearchBar } from "./SearchBar";
import { Logo } from "./Logo";
import { NavWishlistButton } from "./NavWishlistButton";
import { MobileNav } from "./MobileNav";
import { NavDropdown } from "./NavDropdown";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-950/95">
      <div className="container-app flex h-16 items-center gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Logo size={36} />
          <span className="hidden text-lg font-extrabold tracking-tight text-white sm:block">
            Rift<span className="text-brand-400">Compare</span>
            <span className="text-gold">AU</span>
          </span>
        </Link>

        {/* Search */}
        <div className="flex-1">
          <Suspense fallback={<div className="input max-w-xl" />}>
            <SearchBar />
          </Suspense>
        </div>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          <Link href="/forum" className="rounded-lg px-2.5 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white">
            <span className="sm:hidden">Market</span>
            <span className="hidden sm:inline">Market Forum</span>
          </Link>
          <Link href="/browse" className="rounded-lg px-2.5 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white">
            Database
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
                { href: "/sealed", label: "Sealed Products", desc: "Boxes, packs & promos" },
                { href: "/guides", label: "Guides", desc: "Learn Riftbound" },
                { href: "/blog", label: "Blog", desc: "News & meta" },
              ]}
            />
          </div>
          <NavWishlistButton />
          <MobileNav />
        </nav>
      </div>
    </header>
  );
}
