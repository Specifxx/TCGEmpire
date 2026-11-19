"use client";

import Link from "next/link";
import { useMe } from "@/lib/use-me";

// The collection and the card scanner in the desktop header (owner, 2026-11-19: "the scan a card should be within the collection
// page on mobile and on pc it should be visible somewhere as well in the navigation"). From xl: "Collection" (/portfolio, the binder
// Rift already has; signed out, the page asks for a sign-in) and, when /api/me says the scanner is open to this viewer (admins in
// the beta, everyone once SCAN_PUBLIC=1), "Scan" (from lg: the search is the row's one flexible element, so it gives the room). Phones reach both from the bottom bar's Collection tab, whose page leads with
// "Scan a card". Browser-only (the header's server HTML stays the same for everyone): Scan appears once /api/me answers.
export function HeaderCollectionLinks() {
  const { scan } = useMe();
  const cls =
    "hidden items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white lg:inline-flex lg:px-2.5 [@media(pointer:coarse)]:py-3.5";
  return (
    <>
      <Link href="/portfolio" prefetch={false} className={cls.replace("lg:inline-flex", "xl:inline-flex")}>
        Collection
      </Link>
      {scan && (
        <Link href="/scan" prefetch={false} className={cls} data-nav-scan>
          <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
            <rect x="9" y="7.5" width="6" height="9" rx="1" />
          </svg>
          Scan
        </Link>
      )}
    </>
  );
}
