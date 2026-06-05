import type { Metadata } from "next";
import Link from "next/link";
import { getLegends } from "@/lib/legends";
import { DomainBadge } from "@/components/Badge";
import { TierBadge } from "@/components/TierBadge";
import { DOMAIN_KEYS, domainInfo } from "@/lib/constants";
import { formatAUD } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Riftbound Legends — Champions & Decks (Australia)",
  description:
    "Every Riftbound legend in one place. Browse champions by domain, jump straight to their cards, and see featured meta decks with live Australian prices.",
  alternates: { canonical: "/legends" },
};

export default async function LegendsPage() {
  const legends = await getLegends();

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-white">Legends</h1>
        <p className="mt-1 text-sm text-slate-400">
          Every Riftbound champion legend, grouped by domain. Jump to a champion&apos;s cards
          or open a featured meta deck — no scrolling through the whole database.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        {DOMAIN_KEYS.map((dom) => {
          const inDomain = legends.filter((l) => l.domain === dom);
          if (!inDomain.length) return null;
          const d = domainInfo(dom);
          return (
            <section key={dom}>
              <div className="mb-3 flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                <h2 className="text-lg font-extrabold text-white">{d.label}</h2>
                <span className="text-xs text-slate-500">({inDomain.length})</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {inDomain.map((l) => {
                  const href = l.deckSlug ? `/decks/${l.deckSlug}` : `/browse?q=${encodeURIComponent(l.champion)}`;
                  return (
                    <Link
                      key={l.id}
                      href={href}
                      className="group card-surface flex flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-glow"
                    >
                      <div className="relative aspect-[5/7] w-full overflow-hidden bg-ink-900">
                        {l.imageThumbUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={l.imageThumbUrl}
                            alt={l.name}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        )}
                        {l.deckTier && (
                          <div className="absolute left-1.5 top-1.5">
                            <TierBadge tier={l.deckTier} />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-0.5 border-t border-ink-700 p-2.5">
                        <h3 className="line-clamp-1 text-sm font-bold text-white" title={l.name}>
                          {l.champion}
                        </h3>
                        <p className="line-clamp-1 text-[11px] text-slate-500">{l.epithet}</p>
                        <div className="mt-1 flex items-center justify-between">
                          <DomainBadge domain={l.domain} />
                          {l.deckSlug ? (
                            <span className="text-[11px] font-semibold text-brand-400">Deck →</span>
                          ) : l.lowestPriceCents != null ? (
                            <span className="text-[11px] text-slate-500">{formatAUD(l.lowestPriceCents)}</span>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
