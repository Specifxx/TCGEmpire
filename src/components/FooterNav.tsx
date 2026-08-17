import Link from "next/link";
import { FOOTER_GROUPS } from "./nav-groups";
import { HomeFooterToggle } from "./HomeFooterToggle";

// The footer's site-map nav: 4 columns on desktop, collapsible accordions on
// mobile (same chevron/<details> pattern as the homepage FAQ) — EXCEPT on the
// homepage itself, which uses a single "Full site map" accordion at every
// width instead (see the homepage-only block below). Every link from
// FOOTER_GROUPS renders as a real, server-rendered `<Link href>` anchor in
// BOTH layouts, unconditionally — `tests/internal-linking.test.ts` pins
// exactly this ("FooterNav renders FOOTER_GROUPS as real anchors, not
// JS-only navigation") because these links are the only remaining path back
// to over a dozen sections the homepage-redesign brief moved out of the
// homepage body (see DECISIONS.md's "what moved, and where" table) — losing
// that guarantee would silently re-orphan every one of them on the one route
// that most needs them reachable.
//
// THIS FILE STAYS A PLAIN SERVER COMPONENT ON PURPOSE. Picking "home" vs
// "every other route" needs to know the current pathname, which only a
// client component can read (usePathname()) — but making FooterNav itself
// "use client" would fail that exact pinned test (it checks the file's own
// first line) and, more importantly, would be solving a real problem the
// wrong way: the FIX isn't "know less at build time", it's "keep both real,
// crawlable layouts server-rendered and let a small client-only wrapper
// (HomeFooterToggle) choose which one is VISIBLE" — the same pattern
// HeaderSearchSlot/HomeHeaderReveal already established for the header's own
// homepage-only behaviour. See that component's own doc comment for the full
// reasoning on why "both rendered, one hidden via CSS" beats "only one ever
// mounted" here.
//
// WHY THE HOMEPAGE GETS ITS OWN LAYOUT AT ALL: this rebuild moved roughly a
// dozen sections off the homepage body on the promise that every one of them
// stays reachable — mostly true for free via the site-wide nav/footer system
// this component already was, but the promise is what makes the fully-
// expanded 4-column grid load-bearing on "/" specifically: it's the visible
// proof that nothing was actually deleted. That proof used to cost roughly
// 300-400px of page height on every single load, which was most of the gap
// between the homepage's measured height and the redesign's own ≤2.6-screen
// hard target — a target that exists BECAUSE the brief's whole thesis is
// that a returning visitor doesn't need the entire site map re-presented to
// them every time, they need the search box. Collapsing it to one "Full site
// map" accordion on the homepage keeps the proof (one click away, not
// deleted, not requiring the visitor to already know a page exists) without
// permanently spending the height on visitors who came here to search, not
// to browse a directory. Every other route keeps the original, always-
// expanded desktop grid unchanged.
export function FooterNav() {
  return (
    <>
      <HomeFooterToggle match="home">
        <nav aria-label="Site map" className="mb-6 border-b border-ink-800 pb-2 text-left">
          <details className="group py-3">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-slate-300 [&::-webkit-details-marker]:hidden">
              Full site map
              <svg
                className="h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform group-open:rotate-180"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {FOOTER_GROUPS.map((group) => (
                <div key={group.title}>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{group.title}</div>
                  <ul className="tap-list space-y-1">
                    {group.links.map((l) => (
                      <li key={l.href}>
                        <Link href={l.href} className="tap-link text-xs text-slate-400 hover:text-brand-400">
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        </nav>
      </HomeFooterToggle>

      <HomeFooterToggle match="other">
        <nav aria-label="Site map" className="mb-6 border-b border-ink-800 pb-2 sm:pb-6">
          <div className="divide-y divide-ink-800 text-left sm:hidden">
            {FOOTER_GROUPS.map((group) => (
              <details key={group.title} className="group py-3">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-slate-300 sm:min-h-0 [&::-webkit-details-marker]:hidden">
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
                <ul className="tap-list mt-3 space-y-2">
                  {group.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="tap-link text-xs text-slate-400 hover:text-brand-400">
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
                <ul className="tap-list space-y-1">
                  {group.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="tap-link text-xs text-slate-400 hover:text-brand-400">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>
      </HomeFooterToggle>
    </>
  );
}
