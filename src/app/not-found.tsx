import Link from "next/link";
import { Suspense } from "react";
import { SETS } from "@/lib/constants";
import { SearchBar } from "@/components/SearchBar";
import { prisma } from "@/lib/db";
import { CardTile } from "@/components/CardTile";
import { cardTileSelect } from "@/lib/cards";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { getArticles } from "@/lib/articles";

// Branded 404, served with a REAL 404 status (Next's not-found convention) so
// search engines drop dead URLs instead of accumulating soft-404s.
//
// "Site navigation difficulties" is its own AdSense rejection category, and a
// dead end is the clearest example of one. This gives a lost visitor four real
// routes back: a working search box (not a link to one), the cards people
// actually look at, the sets, and our guides. Every one is a live link in the
// server-rendered HTML.
//
// Cached: the popular-card query is identical for everyone and a 404 must never
// be slow. Degrades to the static half if the database is unreachable — a 404
// page that itself errors is the one thing worse than a 404.
export const revalidate = 3600;

export default async function NotFound() {
  const liveSets = SETS.filter((s) => !s.comingSoon);

  const popular = await prisma.card
    .findMany({
      where: { lowestPriceCentsUs: { not: null } },
      orderBy: [{ searchCount: "desc" }, { viewCount: "desc" }, { lowestPriceCentsUs: "desc" }],
      take: 6,
      select: cardTileSelect(DEFAULT_COUNTRY),
    })
    .catch(() => []);

  const guides = getArticles("guide").slice(0, 4);

  return (
    <div className="mx-auto max-w-3xl py-10">
      <div className="text-center">
        <p className="num text-6xl font-extrabold text-brand-400">404</p>
        <h1 className="mt-3 text-2xl font-extrabold text-white">This page doesn&apos;t exist</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
          The card or page you were after may have moved, or may never have existed. Search the
          database below — every Riftbound card is in there, with live prices from stores in six
          markets.
        </p>
      </div>

      {/* A working search field, not a link to one. The Suspense is required:
          SearchBar reads useSearchParams, and an unwrapped read deopts its whole
          subtree to client-side rendering — which on this page would mean a 404
          that serves an empty shell to a crawler. */}
      <div className="mx-auto mt-6 max-w-xl">
        <Suspense fallback={<div className="input h-12" />}>
          <SearchBar variant="hero" />
        </Suspense>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href="/browse" className="btn-primary">Browse every card</Link>
        <Link href="/movers" className="btn-ghost">Today&apos;s price movers</Link>
        <Link href="/sealed" className="btn-ghost">Sealed products</Link>
        <Link href="/guides" className="btn-ghost">Guides &amp; news</Link>
      </div>

      {popular.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Cards people are looking at
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {popular.map((c) => (
              <CardTile key={c.id} card={c} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Browse by set</h2>
        <div className="flex flex-wrap gap-2">
          {liveSets.map((s) => (
            <Link
              key={s.slug}
              href={`/sets/${s.slug}`}
              className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500"
            >
              {s.name}
            </Link>
          ))}
        </div>
      </section>

      {guides.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Or start with a guide
          </h2>
          <ul className="space-y-2">
            {guides.map((g) => (
              <li key={g.slug}>
                <Link href={`/guides/${g.slug}`} className="text-sm font-semibold text-brand-400 hover:underline">
                  {g.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
