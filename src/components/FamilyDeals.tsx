import { getFamilyTiles } from "@/lib/family";
import { blockHeading, familyMoney, tileNote } from "@/lib/family-network";

/**
 * "Other card games on sale" (DECISIONS.md "Sites that grow each other", 2026-11-02): one tile per card-game
 * sister site, its best real store price today in the visitor's market (else its US price, shown in US$),
 * from the sisters' own daily feeds on GitHub (lib/family.ts, cached six hours). One block per page;
 * nothing at all when no sister has anything real to show. Plain followed links: our own sites, no tag.
 */
export async function FamilyDeals({ kind, country, className = "mt-8" }: { kind: "deal" | "preorder"; country: string; className?: string }) {
  const tiles = await getFamilyTiles(kind, country).catch(() => []);
  if (!tiles.length) return null;
  return (
    <section data-family-deals className={`card-surface p-4 ${className}`} aria-labelledby={`family-${kind}`}>
      <h2 id={`family-${kind}`} className="text-lg font-extrabold text-white">{blockHeading("cards", kind)}</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-400">
        Today&apos;s best store price for other card games, from our sister sites&apos; own daily price checks.
      </p>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(({ site, item, more }) => (
          <li key={site.id} className="flex min-w-0 gap-3 rounded-lg border border-ink-700 p-3">
            {item.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image} alt="" aria-hidden="true" width={56} height={56} className="h-14 w-14 shrink-0 rounded object-contain" loading="lazy" />
            ) : null}
            <div className="min-w-0 text-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{site.topic} · {site.name}</p>
              <a href={item.url} target="_blank" rel="noopener" className="tap-link line-clamp-2 font-semibold text-slate-200 hover:text-brand-400">
                {item.title}
              </a>
              <p>
                <span className="num font-extrabold text-gold">{familyMoney(item.cents, item.currency)}</span>{" "}
                <span className="text-xs text-slate-500">at {item.store}</span>
              </p>
              <p className="text-xs text-slate-400">{tileNote(item)}</p>
              {more ? (
                <a href={more} target="_blank" rel="noopener" className="tap-link text-xs text-brand-400 hover:underline">More on {site.name} →</a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
