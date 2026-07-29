import Link from "next/link";
import { FOOTER_GROUPS } from "./nav-groups";

// The footer's site-map nav: 4 columns on desktop, collapsible accordions on
// mobile (same chevron/<details> pattern as the homepage FAQ). Every link from
// FOOTER_GROUPS renders in both layouts — only visibility toggles by breakpoint
// — so nothing here needs client JS and no href is ever dropped.
export function FooterNav() {
  return (
    <nav aria-label="Site map" className="mb-6 border-b border-ink-800 pb-2 sm:pb-6">
      <div className="divide-y divide-ink-800 text-left sm:hidden">
        {FOOTER_GROUPS.map((group) => (
          <details key={group.title} className="group py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-slate-300 [&::-webkit-details-marker]:hidden">
              {group.title}
              <svg
                className="h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform group-open:rotate-180"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <ul className="mt-3 space-y-2">
              {group.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-xs text-slate-400 hover:text-brand-400">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>

      <div className="hidden text-left sm:grid sm:grid-cols-4 sm:gap-x-6 sm:gap-y-4">
        {FOOTER_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{group.title}</div>
            <ul className="space-y-1">
              {group.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-xs text-slate-400 hover:text-brand-400">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
