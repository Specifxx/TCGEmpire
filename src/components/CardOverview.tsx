import Link from "next/link";
import { KeywordText } from "@/components/KeywordTooltip";

// The card's own facts, above the price table: rules text, identity, links to
// its keywords, champion and set, a price summary built from our rows, and up
// to three articles that mention it. Nothing here is written for the page —
// every value comes from the card record, the listings or published articles.
export interface CardOverviewProps {
  name: string;
  description: string | null;
  facts: { label: string; value: string; href?: string }[];
  keywords: { slug: string; name: string }[];
  champion: { slug: string; name: string } | null;
  set: { name: string; href: string };
  priceSummary: string;
  articles: { href: string; title: string; reason: string }[];
}

export function CardOverview(p: CardOverviewProps) {
  return (
    <section aria-labelledby="card-overview-h" className="card-surface mt-4 p-4 sm:mt-6 sm:p-5">
      <h2 id="card-overview-h" className="font-bold text-white">
        {p.name} at a glance
      </h2>
      {p.description && (
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
          <KeywordText text={p.description} />
        </p>
      )}
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {p.facts.map((f) => (
          <div key={f.label} className="flex gap-1.5">
            <dt className="text-slate-500">{f.label}:</dt>
            <dd className="text-slate-200">
              {f.href ? (
                <Link href={f.href} className="text-brand-300 hover:underline">
                  {f.value}
                </Link>
              ) : (
                f.value
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {p.keywords.map((k) => (
            <Link key={k.slug} href={`/keywords/${k.slug}`} className="chip border border-ink-700 hover:border-brand-500">
              {k.name} keyword
            </Link>
          ))}
          {p.champion && (
            <Link href={`/champions/${p.champion.slug}`} className="chip border border-ink-700 hover:border-brand-500">
              All {p.champion.name} cards
            </Link>
          )}
          <Link href={p.set.href} className="chip border border-ink-700 hover:border-brand-500">
            {p.set.name} set
          </Link>
      </p>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">{p.priceSummary}</p>
      {p.articles.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Related guides</h3>
          <ul className="mt-2 space-y-2">
            {p.articles.map((a) => (
              <li key={a.href}>
                <Link href={a.href} className="group block">
                  <span className="block text-sm font-semibold text-brand-400 group-hover:underline">{a.title}</span>
                  <span className="block text-xs text-slate-500">{a.reason}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
