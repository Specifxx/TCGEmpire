import type { Metadata } from "next";
import Link from "next/link";
import { resolveAllDecks } from "@/lib/meta-decks";
import { DomainBadge } from "@/components/Badge";
import { TierBadge } from "@/components/TierBadge";
import { formatAUD } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Riftbound Meta Decks & Build Cost (Australia)",
  description:
    "The current top-tier Riftbound decks, each priced live across Australian stores. See what it costs to build the meta and where to buy every card.",
  alternates: { canonical: "/decks" },
};

export default async function DecksPage() {
  const decks = await resolveAllDecks();

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-white">Meta Decks</h1>
        <p className="mt-1 text-sm text-slate-400">
          The current top-tier Riftbound archetypes — each priced live across Australian
          stores so you can see what it costs to build and where to buy every card.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {decks.map((d) => (
          <Link
            key={d.slug}
            href={`/decks/${d.slug}`}
            className="group card-surface flex flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-glow"
          >
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-ink-900">
              {d.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={d.imageUrl}
                  alt={d.legend}
                  className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/20 to-transparent" />
              <div className="absolute left-2 top-2">
                <TierBadge tier={d.tier} />
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-bold text-white">{d.name}</h2>
              </div>
              <p className="text-xs text-slate-500">{d.archetype} · {d.legend}</p>
              <div className="flex flex-wrap gap-1">
                {d.domains.map((dom) => (
                  <DomainBadge key={dom} domain={dom} />
                ))}
              </div>
              <p className="line-clamp-2 text-xs text-slate-400">{d.description}</p>
              <div className="mt-auto flex items-end justify-between pt-2">
                <div>
                  <div className="text-[11px] text-slate-500">build cost from</div>
                  <div className="text-lg font-bold text-accent">{formatAUD(d.totalCents)}</div>
                </div>
                <div className="text-right text-[11px] text-slate-500">
                  {d.pricedCards}/{d.totalCards} cards priced
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-6 text-center text-[11px] text-slate-600">
        Meta archetypes are a community reference based on recent tournament results and may
        change. Build cost uses each card&apos;s cheapest in-stock AU price and may span multiple stores.
      </p>
    </div>
  );
}
