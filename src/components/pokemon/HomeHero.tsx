import Link from "next/link";
import { KIND_HUBS } from "@/lib/pokemon/hubs";
import { heroLine, type HomeStats } from "@/lib/pokemon/home";

// The top of /pokemon: the H1, one stat line written from the market's data
// (lib/pokemon/home.ts heroLine), the search box and the ways in (the three
// kind hubs, price per pack, sets). The stat line names only the listing
// sources that head a product in THIS market, so Singapore is never told it is
// reading TCGplayer listings, and counts the products that have one.

export function HomeHero({
  stats,
  place,
  converted,
}: {
  stats: HomeStats;
  /** "the United States" */
  place: string;
  /** The reference is a conversion here (every market but the US). */
  converted: boolean;
}) {
  const line = heroLine(stats, place, converted);

  return (
    <section className="card-surface animate-fade-up mb-6 overflow-hidden border-l-2 border-rose-500 bg-ink-900">
      <div className="px-5 py-7 sm:px-6">
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Pokémon Sealed Prices</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">{line}</p>
        <form action="/pokemon/sealed" method="get" className="mt-4 flex max-w-xl flex-wrap gap-2" role="search">
          <label htmlFor="pokemon-search" className="sr-only">
            Search Pokémon sealed products
          </label>
          <input id="pokemon-search" name="q" type="search" placeholder="Search a set or product…" className="input min-w-0 flex-1 basis-56" />
          <button type="submit" className="btn-primary">
            Search
          </button>
        </form>
        <nav aria-label="Pokémon prices by type" className="mt-3 flex flex-wrap gap-1.5">
          {KIND_HUBS.map((h) => (
            <Link key={h.slug} href={h.path} className="chip tap-link bg-ink-800 text-slate-300 hover:bg-ink-700 hover:text-white">
              {h.label}
            </Link>
          ))}
          <Link href="/pokemon/price-per-pack" className="chip tap-link bg-ink-800 text-slate-300 hover:bg-ink-700 hover:text-white">
            Price per pack
          </Link>
          <Link href="/pokemon/sets" className="chip tap-link bg-ink-800 text-slate-300 hover:bg-ink-700 hover:text-white">
            Sets
          </Link>
        </nav>
      </div>
    </section>
  );
}
