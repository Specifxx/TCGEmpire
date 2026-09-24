import Link from "next/link";
import { CardTile } from "@/components/CardTile";
import { timeAgo } from "@/lib/format";
import { RADIANCE_TOTAL_CARDS } from "@/lib/sets/radiance";
import type { RadianceReveals as Reveals } from "@/lib/radiance-reveals";

// "N of 180 revealed · updated {time}" + the newest reveals, on /sets/radiance
// during preview season. See lib/radiance-reveals.ts.
export function RadianceReveals({ data }: { data: Reveals | null }) {
  if (!data) return null;
  return (
    <section aria-labelledby="radiance-reveals-h" className="card-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="radiance-reveals-h" className="text-xl font-extrabold text-white">
          Latest reveals
        </h2>
        <p className="num text-sm text-slate-300">
          <strong className="text-white">{data.revealed}</strong> of {RADIANCE_TOTAL_CARDS} revealed
          {data.latestAt && <> · updated {timeAgo(new Date(data.latestAt))}</>}
        </p>
      </div>
      {data.latest.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
          {data.latest.map((c) => (
            <CardTile key={c.id} card={c} />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-400">
          No Radiance cards are in our database yet. Official reveals appear here the day they are imported.
        </p>
      )}
      <p className="mt-4 text-sm">
        <Link href="/blog/riftbound-radiance-spoilers" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
          Every reveal, with the dated log →
        </Link>
      </p>
    </section>
  );
}
