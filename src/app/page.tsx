import Link from "next/link";
import { prisma } from "@/lib/db";
import { CardTile } from "@/components/CardTile";
import { Logo } from "@/components/Logo";
import { CARD_TILE_SELECT } from "@/lib/cards";
import { SETS, domainInfo, DOMAIN_KEYS } from "@/lib/constants";

export const revalidate = 180;

export default async function HomePage() {
  const [totalCards, pricedCards, valuable, storeGroups] = await Promise.all([
    prisma.card.count(),
    prisma.card.count({ where: { lowestPriceCents: { not: null } } }),
    prisma.card.findMany({
      where: { lowestPriceCents: { not: null } },
      orderBy: { lowestPriceCents: "desc" },
      take: 12,
      select: CARD_TILE_SELECT,
    }),
    prisma.retailerPrice.groupBy({ by: ["retailer"] }),
  ]);
  const storeCount = storeGroups.length;

  return (
    <div className="flex flex-col gap-10">
      {/* Hero */}
      <section className="card-surface overflow-hidden">
        <div className="relative bg-gradient-to-b from-ink-800/60 to-ink-850 px-6 py-10 text-center">
          <div className="mx-auto mb-4 flex items-center justify-center gap-3">
            <Logo size={56} />
            <span className="text-3xl font-extrabold tracking-tight text-white">
              Rift<span className="text-brand-400">Compare</span>
              <span className="text-gold">AU</span>
            </span>
          </div>
          <h1 className="mx-auto max-w-3xl text-2xl font-extrabold text-white sm:text-4xl">
            Compare Riftbound card prices across Australian stores
          </h1>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/browse" className="btn-primary">Browse the database</Link>
            <Link href="/decks" className="btn-ghost">Top meta decks</Link>
            <Link href="/deck" className="btn-ghost">Deck builder &amp; pricing</Link>
          </div>

          {/* Stats */}
          <div className="mx-auto mt-8 grid max-w-lg grid-cols-3 gap-4">
            <Stat value={totalCards.toLocaleString()} label="cards" />
            <Stat value={pricedCards.toLocaleString()} label="priced" />
            <Stat value={String(storeCount)} label="AU stores" />
          </div>
        </div>
      </section>

      {/* Most valuable — compact horizontal scroll */}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-xl font-extrabold text-white">Chase cards</h2>
          <Link href="/browse?priced=1&sort=price_desc" className="btn-ghost text-xs">View all →</Link>
        </div>
        <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
          {valuable.map((c) => (
            <div key={c.id} className="w-36 shrink-0 sm:w-44">
              <CardTile card={c} />
            </div>
          ))}
        </div>
      </section>

      {/* Browse by set */}
      <section>
        <h2 className="mb-4 text-xl font-extrabold text-white">Browse by set</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SETS.map((s) =>
            s.comingSoon ? (
              <div
                key={s.code}
                className="card-surface flex flex-col gap-1 p-4 opacity-60"
                aria-disabled
              >
                <span className="flex items-center gap-2 text-lg font-bold text-white">
                  {s.code}
                  <span className="chip bg-gold/20 text-gold">Coming soon</span>
                </span>
                <span className="text-xs text-slate-400">{s.name}</span>
              </div>
            ) : (
              <Link
                key={s.code}
                href={`/browse?set=${s.code}`}
                className="card-surface flex flex-col gap-1 p-4 transition-colors hover:border-brand-500"
              >
                <span className="text-lg font-bold text-white">{s.code}</span>
                <span className="text-xs text-slate-400">{s.name}</span>
              </Link>
            )
          )}
        </div>
      </section>

      {/* Browse by domain */}
      <section>
        <h2 className="mb-4 text-xl font-extrabold text-white">Browse by domain</h2>
        <div className="flex flex-wrap gap-2">
          {DOMAIN_KEYS.map((k) => {
            const d = domainInfo(k);
            return (
              <Link
                key={k}
                href={`/browse?domain=${k}`}
                className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500"
                style={{ color: d.color }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                {d.label}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg bg-ink-900/70 p-3">
      <div className="text-xl font-extrabold text-gold">{value}</div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
