import type { SisterSite } from "@/lib/sister-sites";

/**
 * "The same comparison for your other game": the sister sites an article
 * links at its end (lib/sister-sites.ts sisterSitesFor). Plain followed links,
 * our own sites — no tracking, no affiliate tag.
 */
export function SisterSites({ sites }: { sites: SisterSite[] }) {
  if (!sites.length) return null;
  const single = sites.length === 1 ? sites[0] : null;
  return (
    <section data-sister-sites className="card-surface mt-8 p-4">
      <h2 className="text-lg font-extrabold text-white">
        {single ? `Collect ${single.game} too?` : "Collect another game too?"}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-400">
        {single
          ? `${single.name} is our sister site: the same store-by-store price comparison, for ${single.game}.`
          : "Our sister sites run the same store-by-store price comparison for other card games."}
      </p>
      <ul className={`mt-3 grid gap-3 ${single ? "" : "sm:grid-cols-3"}`}>
        {sites.map((s) => (
          <li key={s.key} className="rounded-lg border border-ink-700 p-3">
            <a href={s.url} target="_blank" rel="noopener" className="tap-link font-semibold text-brand-400 hover:underline">
              {s.name}
            </a>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{s.what}.</p>
            <ul className="mt-2 grid gap-1 text-sm">
              {s.links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noopener" className="tap-link text-slate-300 hover:text-brand-400">
                    {l.label} →
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
