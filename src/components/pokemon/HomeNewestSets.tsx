import Link from "next/link";
import type { NewestSet } from "@/lib/pokemon/home";
import { PokemonSetCard } from "./PokemonSetCard";

// "Newest sets": the six newest, each with its booster box and ETB "from"
// figures (pre-orders included and flagged). Three on a phone, where six
// stacked cards pushed everything below a screen further down.

export function HomeNewestSets({ sets, currency, total }: { sets: NewestSet[]; currency: string; total: number }) {
  if (!sets.length) return null;
  return (
    <section className="mb-8" aria-labelledby="home-newest">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <h2 id="home-newest" className="scroll-mt-header text-lg font-extrabold text-white">
          Newest sets
        </h2>
        <Link href="/pokemon/sets" className="tap-link text-sm font-semibold text-brand-400 hover:underline">
          All {total} sets →
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sets.map((s, i) => (
          <PokemonSetCard
            key={s.set.slug}
            set={s.set}
            className={i >= 3 ? "hidden sm:flex" : ""}
            from={{
              currency,
              ...(s.box?.lowCents != null ? { boxCents: s.box.lowCents, boxPresale: s.box.presale } : {}),
              ...(s.etb?.lowCents != null ? { etbCents: s.etb.lowCents, etbPresale: s.etb.presale } : {}),
            }}
          />
        ))}
      </div>
    </section>
  );
}
