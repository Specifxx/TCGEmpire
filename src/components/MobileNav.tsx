"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { COUNTRY_LIST, INTL_ENABLED } from "@/lib/country";
import { useCountry } from "./CountryProvider";

// Database + Forum live in the top bar at all sizes, so they're omitted
// here; this menu holds the rest (shown below the lg breakpoint).
const LINKS = [
  { href: "/sealed", label: "Sealed Products" },
  { href: "/decks", label: "Meta Decks" },
  { href: "/deck", label: "Deck Builder" },
  { href: "/proxy", label: "Proxy Printer" },
  { href: "/guides", label: "Guides" },
  { href: "/blog", label: "Blog" },
  { href: "/wishlist", label: "Wishlist" },
];

// Hamburger menu so phone users can reach every section (the desktop links are
// hidden below the sm breakpoint).
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { country, setCountry } = useCountry();

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
            {INTL_ENABLED && (
              <div className="border-b border-ink-700 p-2">
                <div className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Shop &amp; prices for
                </div>
                <div className="flex flex-col gap-1">
                  {COUNTRY_LIST.map((c) => (
                    <button
                      key={c.code}
                      onClick={() => setCountry(c.code)}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${
                        c.code === country ? "bg-ink-800" : "hover:bg-ink-800"
                      }`}
                    >
                      <span className="text-lg leading-none">{c.flag}</span>
                      <span className="flex-1 text-sm font-medium text-white">{c.label}</span>
                      <span className="text-xs text-slate-500">{c.currency}</span>
                      {c.code === country && (
                        <svg className="h-4 w-4 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
