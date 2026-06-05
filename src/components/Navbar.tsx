import Link from "next/link";
import { SessionUser } from "@/lib/auth";
import { formatAUD } from "@/lib/format";
import { SearchBar } from "./SearchBar";

export function Navbar({ user }: { user: SessionUser | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-950/90 backdrop-blur">
      <div className="container-app flex h-16 items-center gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 font-black text-white shadow-glow">
            TE
          </span>
          <span className="hidden text-lg font-extrabold tracking-tight text-white sm:block">
            TCG<span className="text-brand-400">Empire</span>
          </span>
        </Link>

        {/* Search */}
        <div className="flex-1">
          <SearchBar />
        </div>

        {/* Nav links */}
        <nav className="flex items-center gap-2">
          <Link href="/" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-ink-800 hover:text-white md:block">
            Browse
          </Link>
          <Link href="/wanted" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-ink-800 hover:text-white md:block">
            Wanted
          </Link>
          <Link href="/sell" className="btn-ghost hidden md:inline-flex">
            Sell
          </Link>

          {user ? (
            <div className="flex items-center gap-2">
              <span
                className="chip bg-ink-800 text-accent"
                title="Wallet balance"
              >
                {formatAUD(user.balanceCents)}
              </span>
              <Link
                href="/profile"
                className="grid h-9 w-9 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white"
                title={user.displayName}
              >
                {user.displayName.slice(0, 1).toUpperCase()}
              </Link>
            </div>
          ) : (
            <Link href="/login" className="btn-primary">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
