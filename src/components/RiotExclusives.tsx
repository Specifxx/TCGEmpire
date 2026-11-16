import Link from "next/link";
import { RIOT_DRAWINGS } from "@/lib/riot-drawings";

// "Riot exclusives: resale prices" (owner, 2026-11-16: the drawing products deserved a better section than the home row that
// left on 2026-11-12). Static, server-rendered, no query: every fact is Riot's own (lib/riot-drawings.ts) and the resale prices
// live where they already do, in the /sealed board, one tap away through its search. Nothing here is a price we did not read.
const T1_SEARCH = "/sealed?q=T1";

export function RiotExclusives() {
  return (
    <section aria-labelledby="riot-exclusives" className="mt-8">
      <div className="mb-4">
        <h2 id="riot-exclusives" className="text-xl font-extrabold text-white">Riot exclusives: resale prices</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          These boxes were sold only through Riot&apos;s free drawings and at events, never by a store, so the only prices
          to compare are resale. Tap one to see what sellers want for it now.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {RIOT_DRAWINGS.map((d) => (
          <article key={d.groupKey} className="card-surface flex flex-col overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.imageUrl} alt={d.imageAlt} loading="lazy" decoding="async" width={640} height={360} className="aspect-video w-full object-cover" />
            <div className="flex flex-1 flex-col gap-2 p-4">
              <h3 className="text-base font-bold text-white">{d.name}</h3>
              <p className="text-sm text-slate-300">{d.tagline}</p>
              <p className="text-xs text-slate-400">Riot&apos;s price: US${d.priceUsd} plus shipping</p>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-400">
                {d.contents.slice(0, 3).map((c) => (
                  <li key={c}>{c.length > 90 ? `${c.slice(0, 87)}…` : c}</li>
                ))}
              </ul>
              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                <Link href={`/sealed?q=${encodeURIComponent(d.productType.split(" ")[0] === "K/DA" ? "K/DA" : "Worlds 2026")}`} prefetch={false} className="btn-primary px-3 py-1.5 text-xs">
                  See resale prices →
                </Link>
                <Link href={`/blog/${d.blogSlug}`} prefetch={false} className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-ink-800">
                  What&apos;s in the box
                </Link>
              </div>
            </div>
          </article>
        ))}
        <article className="card-surface flex flex-col gap-2 p-4">
          <h3 className="text-base font-bold text-white">T1 Worlds Champion Collection</h3>
          <p className="text-sm text-slate-300">Riot&apos;s first single-team Riftbound collection, also drawing-only, so resale is the market.</p>
          <div className="mt-auto pt-2">
            <Link href={T1_SEARCH} prefetch={false} className="btn-primary px-3 py-1.5 text-xs">See resale prices →</Link>
          </div>
        </article>
      </div>
    </section>
  );
}
