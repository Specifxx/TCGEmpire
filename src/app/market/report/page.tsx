import type { Metadata } from "next";
import Link from "next/link";
import { getMarketIndex, type MarketIndex, type IndexConstituent } from "@/lib/market-index";
import { COUNTRY_LIST, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { SITE_URL } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";

// The monthly market report (DECISIONS.md, "Becoming the cited price outside the
// US", 2026-10-26): every market's RiftCompare Index side by side, in its own
// currency, on one page a journalist, creator or store can quote. TCGplayer's
// numbers are US numbers; this is the page for everyone else.
//
// No query of its own: it reads getMarketIndex(), which caches each market's
// index for days and refreshes on a new history version, so a day here costs
// nothing. Never lower this below 86400 (CLAUDE.md, slow content).
export const revalidate = 86400;

const MONTH = (d: Date) => d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export async function generateMetadata(): Promise<Metadata> {
  const month = MONTH(new Date());
  const title = `Riftbound Market Report, ${month}: Prices in Every Market`;
  return {
    title: { absolute: `${title} | RiftCompare` },
    description: `How Riftbound card prices moved this month in the US, Australia, the UK, Europe, Canada and Singapore: the RiftCompare Index, its 30 and 90-day change, and the biggest movers in each market. Free to cite.`,
    alternates: pageAlternates("/market/report"),
    openGraph: { title, url: `${SITE_URL}/market/report` },
  };
}

function pct(n: number | null): string {
  if (n == null) return "–";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}
function tone(n: number | null): string {
  if (n == null || n === 0) return "text-slate-400";
  return n > 0 ? "text-up" : "text-down";
}

function movers(idx: MarketIndex, dir: 1 | -1, n = 3): IndexConstituent[] {
  return idx.constituents
    .filter((c) => c.d7pct != null && c.priceCents > 0 && Math.sign(c.d7pct) === dir)
    .sort((a, b) => dir * ((b.d7pct ?? 0) - (a.d7pct ?? 0)))
    .slice(0, n);
}

export default async function MarketReportPage() {
  const results = await Promise.all(
    COUNTRY_LIST.map(async (c) => ({ info: c, idx: await getMarketIndex(c.code as Country).catch(() => null) })),
  );
  const markets = results.filter((r): r is { info: (typeof COUNTRY_LIST)[number]; idx: MarketIndex } => !!r.idx);
  const asOfMs = Math.max(0, ...markets.map((m) => m.idx.points[m.idx.points.length - 1]?.t ?? 0));
  const asOf = asOfMs ? new Date(asOfMs) : new Date();
  const month = MONTH(asOf);
  const asOfLabel = asOf.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumbs
        trail={[
          { name: "Market", href: "/market" },
          { name: "Monthly report", href: "/market/report" },
        ]}
      />
      <h1 className="font-display text-3xl font-extrabold text-white">Riftbound market report, {month}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
        How Riftbound single-card prices moved in each market we track, in that market&apos;s own currency. Each figure
        is the <Link href="/market" className="text-brand-400 hover:underline">RiftCompare Index</Link>: a weighted
        basket of the most-searched cards, priced at the cheapest in-stock offer across every store we compare there.
        Data as of {asOfLabel}.
      </p>

      {markets.length === 0 ? (
        <p className="card-surface mt-6 p-5 text-sm text-slate-400">The index is being rebuilt. Check back tomorrow.</p>
      ) : (
        <>
          <div className="card-surface mt-6 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-ink-800 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-3 font-semibold">Market</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Index</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">30 days</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">90 days</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Median card</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Up / down (7d)</th>
                </tr>
              </thead>
              <tbody>
                {markets.map(({ info, idx }) => (
                  <tr key={info.code} className="border-b border-ink-800 last:border-0">
                    <th scope="row" className="px-4 py-3 text-left font-semibold text-white">
                      <Link href={`/market?market=${info.code}`} className="hover:underline">
                        {info.label}
                      </Link>
                    </th>
                    <td className="num px-4 py-3 text-right text-white">{idx.latest.toFixed(1)}</td>
                    <td className={`num px-4 py-3 text-right ${tone(idx.d30)}`}>{pct(idx.d30)}</td>
                    <td className={`num px-4 py-3 text-right ${tone(idx.d90)}`}>{pct(idx.d90)}</td>
                    <td className="num px-4 py-3 text-right text-slate-300">{formatMoney(idx.stats.medianPriceCents, idx.currency)}</td>
                    <td className="num px-4 py-3 text-right text-slate-300">
                      <span className="text-up">{idx.stats.advancing}</span> / <span className="text-down">{idx.stats.declining}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Each market&apos;s index starts at 100 on its own first day and is quoted in its own currency, so compare the
            percentage changes across markets, not the index levels.
          </p>

          <h2 className="mt-10 text-xl font-extrabold text-white">Biggest movers this week, by market</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {markets.map(({ info, idx }) => {
              const up = movers(idx, 1);
              const down = movers(idx, -1);
              return (
                <section key={info.code} className="card-surface p-4">
                  <h3 className="font-bold text-white">{info.label}</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {[...up, ...down].map((c) => (
                      <li key={c.id} className="flex items-baseline justify-between gap-3">
                        <Link href={cardHref(c)} className="min-w-0 truncate text-slate-300 hover:text-white hover:underline">
                          {c.name} <span className="text-xs text-slate-500">{c.setCode} {c.collectorNumber}</span>
                        </Link>
                        <span className="num shrink-0 text-right">
                          <span className="text-slate-400">{formatMoney(c.priceCents, idx.currency)}</span>{" "}
                          <span className={tone(c.d7pct)}>{pct(c.d7pct)}</span>
                        </span>
                      </li>
                    ))}
                    {up.length + down.length === 0 && <li className="text-slate-500">No moves to report this week.</li>}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}

      <section className="card-surface mt-10 p-5 text-sm leading-relaxed text-slate-400">
        <h2 className="font-bold text-white">Quote these numbers</h2>
        <p className="mt-2">
          Anyone may quote this report with a link to <span className="select-all text-slate-300">{`${SITE_URL}/market/report`}</span>.
          Developers and Discord bots can read the same prices from the free{" "}
          <Link href="/api/docs" className="text-brand-400 hover:underline">price API</Link>, and stores and creators can
          show a live price on their own site with an <Link href="/embed" className="text-brand-400 hover:underline">embed</Link>.
          How the index is built: <Link href="/methodology" className="text-brand-400 hover:underline">methodology</Link>.
        </p>
      </section>
    </div>
  );
}
