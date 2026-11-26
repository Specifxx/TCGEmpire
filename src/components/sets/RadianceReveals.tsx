import Link from "next/link";
import { CardTile } from "@/components/CardTile";
import { timeAgo } from "@/lib/format";
import { RADIANCE_TOTAL_CARDS } from "@/lib/sets/radiance";
import type { RadianceReveals as Reveals } from "@/lib/radiance-reveals";

// "N of 180 revealed · updated {time}" + the newest reveals, on /sets/radiance
// during preview season. See lib/radiance-reveals.ts.
export function RadianceReveals({ data }: { data: Reveals | null }) {
  return (
    <SetRevealsStrip
      data={data}
      setName="Radiance"
      total={RADIANCE_TOTAL_CARDS}
      logHref="/blog/riftbound-radiance-spoilers"
      logLabel="Every reveal, with the dated log →"
    />
  );
}

// Any set's preview-season strip (2026-11-27: Legacy on /sets/legacy and in its
// spoilers post). Before the first card is imported it says when previews start.
export function SetRevealsStrip({
  data,
  setName,
  total,
  logHref,
  logLabel,
  emptyNote,
  headingId,
}: {
  data: Reveals | null;
  setName: string;
  total: number;
  logHref?: string;
  logLabel?: string;
  emptyNote?: string;
  headingId?: string;
}) {
  if (!data) return null;
  const hid = headingId ?? `${setName.toLowerCase()}-reveals-h`;
  return (
    <section aria-labelledby={hid} className="card-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={hid} className="text-xl font-extrabold text-white">
          Latest {setName} reveals
        </h2>
        <p className="num text-sm text-slate-300">
          {data.revealed >= total ? (
            <>
              <strong className="text-white">{data.revealed}</strong> printings revealed
            </>
          ) : (
            <>
              <strong className="text-white">{data.revealed}</strong> of {total} revealed
            </>
          )}
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
          {emptyNote ?? `No ${setName} cards are in our database yet. Official reveals appear here the day they are imported.`}
        </p>
      )}
      {logHref && (
        <p className="mt-4 text-sm">
          <Link href={logHref} className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            {logLabel ?? "Every reveal so far →"}
          </Link>
        </p>
      )}
    </section>
  );
}
