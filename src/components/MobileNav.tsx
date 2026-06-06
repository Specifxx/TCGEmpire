"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Database + Market Forum live in the top bar at all sizes, so they're omitted
// here; this menu holds the rest (shown below the lg breakpoint).
const LINKS = [
  { href: "/sealed", label: "Sealed Products" },
  { href: "/decks", label: "Meta Decks" },
  { href: "/deck", label: "Deck Builder" },
  { href: "/guides", label: "Guides" },
  { href: "/blog", label: "Blog" },
  { href: "/wishlist", label: "Wishlist" },
];

// Hamburger menu so phone users can reach every section (the desktop links are
// hidden below the sm breakpoint).
export function MobileNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-lg text-slate-200 hover:bg-ink-800"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute right-2 top-14 z-50 w-56 overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
            <ul className="py-1">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-3 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
