import Link from "next/link";
import { RIOT_DRAWINGS, drawingStatus, drawingWindow, type RiotDrawing } from "@/lib/riot-drawings";
import { sealedPath } from "@/lib/sealed-slug";

// Riot's drawing-only drops, near the top of every home (owner, 2026-11-04:
// "the K/DA couture collection as well as the new worlds 2026 bundle … featured
// on the front page close to the top"). A server component with no query: the
// facts are lib/riot-drawings.ts, Riot's own, and the images are Riot's renders.
//
// `pricedKeys` are the sealed group keys that have a resale row in at least one
// market (the sealed importer's eBay pass, lib/sealed-import.ts
// RIOT_DRAWING_SEEDS). A product with one links its own /sealed page; one
// without says resale is being watched for rather than pointing at a 404.
//
// The status chip is dated from the render, and every home is cached six hours
// (page revalidate), so "registration open" can run a few hours past the close.
// The dates themselves are printed beside it, so a visitor can tell.
export function RiotDrawingsRow({ pricedKeys, today }: { pricedKeys: ReadonlySet<string>; today: string }) {
  return (
    <section aria-labelledby="home-riot-drawings">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="home-riot-drawings" className="text-xl font-extrabold text-white">
            New from Riot: the K/DA Couture Collection and the Worlds 2026 Edition
          </h2>
          <p className="text-sm text-slate-400">
            Sold only through the Riot Merch Store&apos;s free drawings and at the events, never by a store. What is in each
            box, when to register, and resale prices as they appear.
          </p>
        </div>
        <Link href={`/blog/${RIOT_DRAWINGS[0].blogSlug}`} className="text-sm font-semibold text-brand-400 hover:underline">
          Full guide →
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {RIOT_DRAWINGS.map((d) => (
          <DrawingCard key={d.groupKey} d={d} priced={pricedKeys.has(d.groupKey)} today={today} />
        ))}
      </div>
    </section>
  );
}

function DrawingCard({ d, priced, today }: { d: RiotDrawing; priced: boolean; today: string }) {
  const status = drawingStatus(d, today);
  const window = drawingWindow(d);
  const chip =
    status === "open"
      ? { text: `Registration open · ${window}`, cls: "bg-emerald-500/15 text-emerald-300" }
      : status === "upcoming"
        ? { text: `Drawing opens ${window}`, cls: "bg-amber-500/15 text-amber-300" }
        : { text: `Drawing closed · ran ${window}`, cls: "bg-ink-800 text-slate-300" };
  return (
    <article className="card-surface flex flex-col overflow-hidden sm:flex-row">
      <Link href={`/blog/${d.blogSlug}`} className="block shrink-0 bg-ink-950 sm:w-56" aria-label={`${d.name}: what is in the box`}>
        {/* Riot's CDN, like every card image since Vendetta; a plain <img> as the sealed tiles use. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={d.imageUrl}
          alt={d.imageAlt}
          loading="lazy"
          decoding="async"
          className="aspect-[16/9] h-full w-full object-cover sm:aspect-auto"
        />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`chip font-semibold ${chip.cls}`}>{chip.text}</span>
          <span className="chip bg-ink-800 text-slate-300">US${d.priceUsd} + shipping</span>
        </div>
        <h3 className="text-base font-extrabold leading-tight text-white">
          <Link href={`/blog/${d.blogSlug}`} className="hover:underline">
            {d.name}
          </Link>
        </h3>
        <p className="text-sm text-slate-300">{d.tagline}</p>
        <p className="text-xs text-slate-400">
          Selection emails from {new Date(`${d.drawing.emails}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}; also at {d.inPerson}.
        </p>
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm font-semibold">
          <Link href={`/blog/${d.blogSlug}`} className="text-brand-400 hover:underline">
            What&apos;s in the box →
          </Link>
          <a href={d.riotUrl} rel="noopener nofollow" target="_blank" className="text-brand-400 hover:underline">
            How to enter at Riot ↗
          </a>
          {priced ? (
            <Link href={sealedPath(d.groupKey)} className="text-brand-400 hover:underline">
              Resale prices →
            </Link>
          ) : (
            <span className="font-normal text-slate-500">Resale prices appear here once listings exist</span>
          )}
        </div>
      </div>
    </article>
  );
}
