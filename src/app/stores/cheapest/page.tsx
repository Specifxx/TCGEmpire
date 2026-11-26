import type { Metadata } from "next";
import Link from "next/link";
import { COUNTRIES, type Country } from "@/lib/country";
import { storeBySlug, storeSlug } from "@/lib/store-pages";
import { pageAlternates } from "@/lib/seo";
import {
  MIN_BADGE_WINS,
  STORE_WINS_BASIS,
  lastCompleteMonth,
  listStoreWinMonths,
  monthLabel,
  readStoreWins,
  summarise,
  type StoreWinSummary,
} from "@/lib/store-wins";

// The month's cheapest Riftbound stores, per market (lib/store-wins.ts). The last complete month once one is
// recorded; before that, the month so far, labelled as such. Committed files only, no query.
export const revalidate = 86400;

const MARKETS: Country[] = ["US", "AU", "UK", "CA", "EU", "SG"];

function pick() {
  const months = listStoreWinMonths();
  const complete = lastCompleteMonth();
  const month = months.includes(complete) ? complete : months[months.length - 1];
  return month ? { month, data: readStoreWins(month), partial: month !== complete && month > complete } : null;
}

export function generateMetadata(): Metadata {
  const p = pick();
  const label = p ? monthLabel(p.month) : "this month";
  return {
    title: `Cheapest Riftbound stores of ${label}`,
    description: `Which Riftbound stores had the lowest sealed prices most often in ${label}, in each market we compare, counted daily from every store's own listings.`,
    alternates: pageAlternates("/stores/cheapest"),
  };
}

export default function CheapestStoresPage() {
  const p = pick();
  const rows = p?.data ? summarise(p.data) : [];
  const days = p?.data?.days.length ?? 0;
  const label = p ? monthLabel(p.month) : "";
  const markets = MARKETS.map((code) => ({ code, info: COUNTRIES[code], rows: rows.filter((r) => r.country === code).slice(0, 15) })).filter(
    (m) => m.rows.length > 0,
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-400">
          Cheapest price · {label}
          {p?.partial ? " so far" : ""}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-white sm:text-3xl">
          The cheapest Riftbound stores of {label || "the month"}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          Every day we compare every sealed Riftbound product across the stores in each market. When two or more stores have
          a product in stock, the one with the lowest price is the cheapest that day. Below: how many different products each
          store was cheapest on{p?.partial ? `, over the ${days} days recorded so far this month` : ` across ${days} days`}.
        </p>
        {markets.length > 1 && (
          <nav aria-label="Jump to a market" className="mt-4 flex flex-wrap gap-2">
            {markets.map((m) => (
              <a
                key={m.code}
                href={`#market-${m.code.toLowerCase()}`}
                className="chip min-h-11 border border-ink-700 px-3 text-sm text-slate-300 hover:border-brand-500 sm:[@media(pointer:fine)]:min-h-0"
              >
                {m.info.flag} {m.info.label}
              </a>
            ))}
          </nav>
        )}
      </div>

      {markets.length === 0 && <p className="text-sm text-slate-400">The first month is still being recorded.</p>}

      {markets.map((m) => (
        <section key={m.code} id={`market-${m.code.toLowerCase()}`} className="scroll-mt-header" aria-labelledby={`h-${m.code}`}>
          <h2 id={`h-${m.code}`} className="mb-3 text-lg font-bold text-white">
            {m.info.flag} {m.info.label}
          </h2>
          <ol className="card-surface divide-y divide-ink-800 p-0">
            {m.rows.map((r) => (
              <Row key={r.retailer} r={r} />
            ))}
          </ol>
        </section>
      ))}

      <section className="max-w-3xl text-sm leading-relaxed text-slate-400" aria-labelledby="how-h">
        <h2 id="how-h" className="text-base font-bold text-white">
          How we count
        </h2>
        <p className="mt-2">{STORE_WINS_BASIS}</p>
        <p className="mt-2">
          A tie counts for each store at the lowest price. Being the only store with stock is never counted. Prices are
          compared only within a market, in its own currency, so nothing is converted. Stores with the cheapest price on{" "}
          {MIN_BADGE_WINS} or more products in a month can show a badge on their own site, which links to their page here
          with the products behind the number.
        </p>
        <p className="mt-2">
          Run a store? <Link href="/stores/tracked" className="text-brand-400 hover:underline">Find your store&apos;s page</Link>{" "}
          or <Link href="/stores/suggest" className="text-brand-400 hover:underline">ask us to add it</Link>.
        </p>
      </section>
    </div>
  );
}

function Row({ r }: { r: StoreWinSummary }) {
  const slug = storeSlug(r.retailer);
  const page = storeBySlug(slug);
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="num w-7 shrink-0 text-right text-sm font-bold text-slate-500">{r.rankInMarket}</span>
      <span className="min-w-0 flex-1">
        {page ? (
          <Link href={`/stores/${slug}`} className="font-semibold text-slate-100 hover:text-brand-400 hover:underline">
            {r.name}
          </Link>
        ) : (
          <span className="font-semibold text-slate-100">{r.name}</span>
        )}
        <span className="block truncate text-xs text-slate-500">{r.top.slice(0, 2).map((t) => t.title).join(" · ")}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="num block text-base font-bold text-brand-400">{r.products}</span>
        <span className="block text-[11px] text-slate-500">of {r.contested} products</span>
      </span>
    </li>
  );
}
