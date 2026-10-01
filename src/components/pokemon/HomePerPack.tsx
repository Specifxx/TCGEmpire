import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { sourceWord } from "@/lib/pokemon/format";
import { formatPerPack } from "@/lib/pokemon/value";
import type { PerPackGroup } from "@/lib/pokemon/home";

// "Lowest price per pack": the section's signature figure, for the three
// kinds with a hub. Each row reads product, set, then the per-pack figure and
// the listing it comes from. Renders nothing when no group has enough rows
// (Singapore, or a market with almost no tracked listings).

export function HomePerPack({ groups, currency, asOf }: { groups: PerPackGroup[]; currency: string; asOf: string | null }) {
  if (!groups.length) return null;
  return (
    <section className="mb-8" aria-labelledby="home-per-pack">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <h2 id="home-per-pack" className="scroll-mt-header text-lg font-extrabold text-white">
          Lowest price per pack{asOf ? `, ${asOf}` : ""}
        </h2>
        <Link href="/pokemon/price-per-pack" className="tap-link text-sm font-semibold text-brand-400 hover:underline">
          Every kind, ranked →
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {groups.map((g) => (
          <div key={g.hub.slug} className="card-surface p-4">
            <h3 className="mb-2 text-sm font-extrabold text-white">
              <Link href={g.hub.path} className="hover:text-brand-300 hover:underline">
                {g.hub.label}
              </Link>
            </h3>
            <ol className="space-y-2.5">
              {g.rows.map((t) => (
                <li key={t.id} className="text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/pokemon/sealed/${t.slug}`} className="line-clamp-2 min-w-0 font-semibold text-slate-200 hover:text-brand-300 hover:underline" title={t.name}>
                      {t.name}
                    </Link>
                    <span className="num shrink-0 whitespace-nowrap font-bold text-accent">{formatPerPack(t.perPackCents as number, currency)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate text-slate-500">{t.setName ?? "No set"}</span>
                    <span className="num shrink-0 whitespace-nowrap text-[11px] text-slate-400">
                      {formatMoney(t.lowCents as number, currency)} {sourceWord(t.lowSource)}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Cheapest open listing divided by the booster packs inside; item price, postage extra. Pre-orders are not ranked.
      </p>
    </section>
  );
}
