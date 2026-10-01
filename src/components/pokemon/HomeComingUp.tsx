import Link from "next/link";
import { formatDay } from "@/lib/pokemon/format";
import { daysWording, type ComingUp } from "@/lib/pokemon/home";
import { PokemonTile } from "./PokemonTile";

// "Coming up": the next set TCGplayer lists pre-orders for, how far off its
// date is, and a few pre-orders in date order (lib/pokemon/home.ts groups
// them by date; one grid, because each tile already carries its date and a
// one-tile group stranded a lone card on its own row). Every date is
// attributed ("TCGplayer lists"): TCGplayer's dates are the only ones we
// hold, and they can be wrong.

export function HomeComingUp({ data, currency }: { data: ComingUp; currency: string }) {
  if (!data.groups.length && !data.next) return null;
  const next = data.next;
  const nextDay = next ? formatDay(next.releasedOn) : null;
  const tiles = data.groups.flatMap((g) => g.tiles);
  return (
    <section className="mb-8" aria-labelledby="home-coming-up">
      <h2 id="home-coming-up" className="scroll-mt-header mb-1 text-lg font-extrabold text-white">
        Coming up
      </h2>
      {next && nextDay && (
        <p className="mb-3 text-sm text-slate-300">
          <Link href={`/pokemon/sets/${next.set.slug}`} className="font-semibold text-brand-400 hover:underline">
            {next.set.name}
          </Link>
          : TCGplayer lists {nextDay} ({daysWording(next.days)}).
          {data.total > 0 && ` ${data.total.toLocaleString("en-US")} pre-orders across the catalogue.`}
        </p>
      )}
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <PokemonTile key={t.id} tile={t} currency={currency} eager={i < 4} />
          ))}
        </div>
      )}
    </section>
  );
}
