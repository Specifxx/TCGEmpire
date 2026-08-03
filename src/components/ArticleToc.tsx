import type { TocEntry } from "@/lib/toc";

/**
 * "On this page" — jump links built from the article's own ## / ### headings.
 *
 * Two jobs. For readers: a 2,900-word explainer is unusable without one. For
 * search: Google lifts these into the jump-to-section sitelinks under a result,
 * and an answer engine reading the page gets an explicit outline of what it
 * covers before parsing a word of prose.
 *
 * Rendered as a <details> so it costs one line on mobile, open by default on
 * desktop via the `open` attribute — the outline is the point, hiding it defeats
 * it, and `open` still collapses fine on a small screen because the summary row
 * stays tappable.
 */
export function ArticleToc({ entries }: { entries: TocEntry[] }) {
  // Below ~4 sections a TOC is noise, not navigation.
  if (entries.length < 4) return null;
  return (
    <nav aria-label="On this page" className="card-surface my-6 p-4">
      <details open>
        <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-wider text-slate-400">
          On this page
        </summary>
        <ol className="mt-3 space-y-1.5 text-sm">
          {entries.map((e) => (
            <li key={e.id} className={e.level === 3 ? "pl-4" : ""}>
              <a href={`#${e.id}`} className="text-slate-300 hover:text-brand-400 hover:underline">
                {e.text}
              </a>
            </li>
          ))}
        </ol>
      </details>
    </nav>
  );
}
