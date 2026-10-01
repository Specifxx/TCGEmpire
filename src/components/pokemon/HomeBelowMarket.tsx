import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { sourceWord } from "@/lib/pokemon/format";
import type { BelowMarketRow } from "@/lib/pokemon/home";

// "Listed under TCGplayer's market price", US only (lib/pokemon/home.ts
// belowMarket): the gap between a product's cheapest open listing and the
// reference TCGplayer publishes for it. The copy states the gap and nothing
// more: no "deal", no claim about what the product is or will be.

export function HomeBelowMarket({ rows, currency, asOf }: { rows: BelowMarketRow[]; currency: string; asOf: string | null }) {
  if (!rows.length) return null;
  return (
    <section className="mb-8" aria-labelledby="home-below">
      <h2 id="home-below" className="scroll-mt-header mb-1 text-lg font-extrabold text-white">
        Listed under TCGplayer&apos;s market price
      </h2>
      <p className="mb-3 max-w-3xl text-sm text-slate-400">
        Released products whose cheapest open listing in the United States is below the market price TCGplayer publishes for
        it, a reference rather than a listing{asOf ? `, ${asOf}` : ""}. A listing can change or sell out at any time, so open it before you
        decide.
      </p>
      <ol className="card-surface divide-y divide-ink-800">
        {rows.map(({ tile: t, pctUnder }) => (
          <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <Link href={`/pokemon/sealed/${t.slug}`} className="tap-link-block font-semibold text-slate-200 hover:text-brand-300 hover:underline">
                <span className="line-clamp-2">{t.name}</span>
              </Link>
              <div className="truncate text-xs text-slate-500">{t.setName ?? "No set"}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="num whitespace-nowrap">
                <span className="font-bold text-accent">{formatMoney(t.lowCents as number, currency)}</span>{" "}
                <span className="text-[11px] text-slate-400">{sourceWord(t.lowSource)}</span>
              </div>
              <div className="num whitespace-nowrap text-[11px] text-slate-400">
                market {formatMoney(t.refCents as number, currency)} · <span className="font-semibold text-brand-300">−{pctUnder}%</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
