import Link from "next/link";
import { prisma } from "@/lib/db";
import { CardTile } from "@/components/CardTile";
import { SearchBar } from "@/components/SearchBar";
import { Logo } from "@/components/Logo";
import { CARD_TILE_SELECT } from "@/lib/cards";
import { SETS, domainInfo, DOMAIN_KEYS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [totalCards, pricedCards, valuable, storeGroups] = await Promise.all([
    prisma.card.count(),
    prisma.card.count({ where: { lowestPriceCents: { not: null } } }),
    prisma.card.findMany({
      where: { lowestPriceCents: { not: null } },
      orderBy: { lowestPriceCents: "desc" },
      take: 6,
      select: CARD_TILE_SELECT,
    }),
    prisma.retailerPrice.groupBy({ by: ["retailer"] }),
  ]);
  const storeCount = storeGroups.length;

  return (
    <div className="flex flex-col gap-10">
      {/* Hero */}
      <section className="card-surface overflow-hidden">
        <div className="relative bg-gradient-to-br from-brand-600/25 via-ink-850 to-gold/10 px-6 py-12 text-center">
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
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-300 sm:text-base">
            Every Riftbound single in one place, with live prices from Aussie
            retailers — find the cheapest delivered price, build decks, and track
            your wishlist.
          </p>

          <div className="mx-auto mt-6 max-w-xl">
            <SearchBar />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link href="/browse" className="btn-primary">Browse the database</Link>
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

      {/* Most valuable */}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-white">Most valuable right now</h2>
            <p className="text-sm text-slate-400">The priciest Riftbound singles on the AU market.</p>
          </div>
          <Link href="/browse?priced=1&sort=price_desc" className="btn-ghost text-xs">View all →</Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          {valuable.map((c) => (
            <CardTile key={c.id} card={c} />
          ))}
        </div>
      </section>

      {/* Browse by set */}
      <section>
        <h2 className="mb-4 text-xl font-extrabold text-white">Browse by set</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SETS.map((s) => (
            <Link
              key={s.code}
              href={`/browse?set=${s.code}`}
              className="card-surface flex flex-col gap-1 p-4 transition-colors hover:border-brand-500"
            >
              <span className="text-lg font-bold text-white">{s.code}</span>
              <span className="text-xs text-slate-400">{s.name}</span>
            </Link>
          ))}
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

      {/* How it works */}
      <section className="card-surface p-6">
        <h2 className="mb-4 text-xl font-extrabold text-white">How it works</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Step n="1" title="Search any card" text="Find any Riftbound card by name or number — apostrophes and all." />
          <Step n="2" title="Compare AU prices" text="See live in-stock prices from Australian stores, ranked by cheapest delivered cost." />
          <Step n="3" title="Buy & build" text="Click through to the store, save cards to your wishlist, and price whole decks." />
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

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <div className="rounded-lg bg-ink-900 p-4">
      <div className="mb-2 grid h-8 w-8 place-items-center rounded-full bg-brand-500 font-bold text-white">{n}</div>
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="mt-1 text-sm text-slate-400">{text}</p>
    </div>
  );
}
