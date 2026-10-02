import Link from "next/link";
import { cardHref } from "@/lib/card-url";
import { formatMoney } from "@/lib/format";
import type { GuideStats, SetPriceSummary } from "@/lib/price-guide-query";

// The figures above the price guide's table, all computed on the server from
// rows already in memory (no query of their own): a stat strip, a "Prices by
// set" table and a short how-to-read. They are also the page's own words — the
// editorial a table alone does not supply (scripts/adsense-guard.ts §6).
//
// Set names come from SETS only (via pricesBySet), never typed here, and each
// set links to its hub's own price guide, which keeps "<set> price guide" on
// /sets/<slug> (docs/seo-keyword-map.md).
export function PriceGuideSummary({
  stats,
  sets,
  currency,
  place,
}: {
  stats: GuideStats;
  sets: SetPriceSummary[];
  currency: string;
  /** COUNTRIES[market].place, e.g. "the United Kingdom". */
  place: string;
}) {
  const unit = formatMoney(100, currency).replace(/\.00$/, "");
  const tiles: { label: string; value: React.ReactNode; note?: React.ReactNode }[] = [
    { label: "Cards listed", value: stats.listed.toLocaleString("en-US"), note: "Every printing has its own row" },
    {
      label: `Priced in ${place}`,
      value: stats.priced.toLocaleString("en-US"),
      note: stats.listed ? `${Math.round((stats.priced / stats.listed) * 100)}% have a seller in stock` : undefined,
    },
    {
      label: "Median price",
      value: stats.medianCents != null ? formatMoney(stats.medianCents, currency) : "—",
      note:
        stats.underOneShare != null ? `${Math.round(stats.underOneShare * 100)}% of priced cards cost under ${unit}` : undefined,
    },
    {
      label: "Dearest card",
      value: stats.dearest ? formatMoney(stats.dearest.cents, currency) : "—",
      note: stats.dearest ? (
        <Link href={cardHref(stats.dearest.row)} prefetch={false} className="text-brand-400 hover:underline">
          {stats.dearest.row.dn} <span className="num">{stats.dearest.row.no}</span>
        </Link>
      ) : undefined,
    },
  ];

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="card-surface min-w-0 p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.label}</dt>
            <dd className="num mt-1 text-2xl font-extrabold text-white">{t.value}</dd>
            {t.note && <dd className="mt-0.5 truncate text-xs text-slate-400">{t.note}</dd>}
          </div>
        ))}
      </dl>

      {sets.length > 0 && (
        <section aria-labelledby="pg-by-set" className="card-surface overflow-hidden">
          <div className="p-4 pb-2 sm:px-5">
            <h2 id="pg-by-set" className="text-lg font-bold text-white">
              Prices by set
            </h2>
            <p className="mt-0.5 text-sm text-slate-400">
              How each released set prices in {place}, in {currency}. A set&apos;s name opens its own price guide.
            </p>
          </div>
          <table className="w-full table-fixed text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-y border-ink-800 bg-ink-900 text-left">
                <th scope="col" className="px-4 py-2 font-semibold sm:px-5">
                  Set
                </th>
                <th scope="col" className="w-20 px-3 py-2 text-right font-semibold sm:w-24">
                  Priced
                </th>
                <th scope="col" className="w-24 px-3 py-2 text-right font-semibold sm:w-28">
                  Median
                </th>
                <th scope="col" className="hidden px-3 py-2 font-semibold sm:table-cell sm:pr-5">
                  Dearest card
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {sets.map((s) => (
                <tr key={s.code} className="transition-colors hover:bg-ink-800/50">
                  <td className="truncate px-4 py-2 sm:px-5">
                    <Link href={`/sets/${s.slug}#price-guide`} className="font-semibold text-brand-400 hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="num px-3 py-2 text-right text-slate-300">
                    {s.priced.toLocaleString("en-US")}
                    <span className="text-slate-500">/{s.listed.toLocaleString("en-US")}</span>
                  </td>
                  <td className="num px-3 py-2 text-right font-semibold text-white">
                    {s.medianCents != null ? formatMoney(s.medianCents, currency) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="hidden truncate px-3 py-2 sm:table-cell sm:pr-5">
                    {s.dearest ? (
                      <>
                        <Link href={cardHref(s.dearest.row)} prefetch={false} className="text-slate-200 hover:text-brand-400 hover:underline">
                          {s.dearest.row.dn}
                        </Link>{" "}
                        <span className="num text-xs text-slate-400">{formatMoney(s.dearest.cents, currency)}</span>
                      </>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
