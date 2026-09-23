import type { TocEntry } from "@/lib/toc";

/**
 * "On this page" — jump links built from the article's own ## / ### headings.
 *
 * Two jobs. For readers: a 2,900-word explainer is unusable without one. For
 * search: Google lifts these into the jump-to-section sitelinks under a result,
 * and an answer engine reading the page gets an explicit outline of what it
 * covers before parsing a word of prose.
 *
 * - Open by default at every width via the `open` attribute: the outline is the
 *   point, and hiding it defeats it. There is deliberately no script that
 *   collapses it on phones (one inserted by React would not run on a client-side
 *   <Link> navigation, so the TOC would differ between a hard load and a click).
 * - The chevron row is the visible collapse control on small screens: the whole
 *   summary is a 44px row (48px on touch, via globals.css's coarse-pointer
 *   .min-h-11), where before it was a 16px line with no marker (2026-09-23).
 * - Links get the 24px WCAG 2.5.8 floor (inline-flex min-h-6) but not tap-link:
 *   tap-link's 48px coarse-pointer rows would make an always-open 11-entry TOC
 *   ~594px tall on a 390px phone, against ~382px with the floor.
 * - From 1700px it becomes a sticky aside in the article's empty right gutter
 *   (absolute, 15rem wide, pinned at top 96px under the one-row header). The
 *   containing block is ArticleView's `min-[1700px]:relative` <article>, so it
 *   stops inside the article and never runs into the footer. Below 1700px the
 *   wrapper div is inert: the nav's my-6 margin collapses through it. DOM order
 *   is unchanged, so crawlers read the outline in the same place. max-h +
 *   overflow-y-auto keeps a long outline (15 entries on
 *   best-riftbound-price-comparison-sites) reachable on a short window.
 */
export function ArticleToc({ entries }: { entries: TocEntry[] }) {
  // Below ~4 sections a TOC is noise, not navigation.
  if (entries.length < 4) return null;
  return (
    <div className="min-[1700px]:absolute min-[1700px]:inset-y-0 min-[1700px]:left-full min-[1700px]:ml-10 min-[1700px]:w-60">
      <nav
        aria-label="On this page"
        className="card-surface my-6 px-4 py-1 min-[1700px]:sticky min-[1700px]:top-24 min-[1700px]:my-0 min-[1700px]:max-h-[calc(100vh-7rem)] min-[1700px]:overflow-y-auto"
      >
        <details open className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 [&::-webkit-details-marker]:hidden">
            On this page
            <span aria-hidden className="transition-transform group-open:rotate-180">▾</span>
          </summary>
          <ol className="mt-1 space-y-0.5 pb-3 text-sm">
            {entries.map((e) => (
              <li key={e.id} className={e.level === 3 ? "pl-4" : ""}>
                <a href={`#${e.id}`} className="inline-flex min-h-6 items-center text-slate-300 hover:text-brand-400 hover:underline">
                  {e.text}
                </a>
              </li>
            ))}
          </ol>
        </details>
      </nav>
    </div>
  );
}
