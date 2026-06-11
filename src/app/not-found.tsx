import Link from "next/link";
import { SETS } from "@/lib/constants";

// Branded 404. Served with a real 404 status (so search engines drop dead URLs)
// while giving lost visitors somewhere useful to go instead of bouncing.
export default function NotFound() {
  const liveSets = SETS.filter((s) => !s.comingSoon);
  return (
    <div className="mx-auto max-w-2xl py-12 text-center">
      <p className="font-mono text-6xl font-extrabold text-brand-400">404</p>
      <h1 className="mt-3 text-2xl font-extrabold text-white">This page doesn&apos;t exist</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        The card or page you&apos;re after may have moved or never existed. Try searching the
        database — every Riftbound card is in there with live prices.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href="/browse" className="btn-primary">Search the card database</Link>
        <Link href="/movers" className="btn-ghost">📈 Price movers</Link>
        <Link href="/sealed" className="btn-ghost">Sealed products</Link>
      </div>
      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Browse by set</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
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
      </div>
    </div>
  );
}
