import Link from "next/link";
import { SearchBar } from "./SearchBar";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-950/90 backdrop-blur">
      <div className="container-app flex h-16 items-center gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 font-black text-white shadow-glow">
            RE
          </span>
          <span className="hidden text-lg font-extrabold tracking-tight text-white sm:block">
            Rift<span className="text-brand-400">Empire</span>
            <span className="text-slate-400">Australia</span>
          </span>
        </Link>

        {/* Search */}
        <div className="flex-1">
          <SearchBar />
        </div>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          <Link href="/" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-ink-800 hover:text-white">
            Database
          </Link>
          <Link
            href="/?priced=1&sort=price_desc"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-ink-800 hover:text-white md:block"
          >
            Top prices
          </Link>
        </nav>
      </div>
    </header>
  );
}
