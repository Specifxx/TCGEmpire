import Link from "next/link";
import { Suspense } from "react";
import { SearchBar } from "./SearchBar";
import { Logo } from "./Logo";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-950/90 backdrop-blur">
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
          <Link href="/browse" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-ink-800 hover:text-white">
            Database
          </Link>
          <Link href="/decks" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-ink-800 hover:text-white sm:block">
            Meta Decks
          </Link>
          <Link href="/deck" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-ink-800 hover:text-white sm:block">
            Deck Builder
          </Link>
          <Link
            href="/wishlist"
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-ink-800 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 21s-7.5-4.6-10-9.2C.4 8.4 2 5 5.2 5c1.9 0 3.2 1 3.8 2.2C9.6 6 11 5 12.8 5 16 5 17.6 8.4 16 11.8 13.5 16.4 12 21 12 21z" />
            </svg>
            <span className="hidden sm:inline">Wishlist</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
