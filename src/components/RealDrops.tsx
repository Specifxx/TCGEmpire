import { DiscordCta } from "@/components/DiscordCta";
import Link from "next/link";
import { OutboundLink } from "@/components/OutboundLink";
import { affiliateUrl, ebaySealedQuery, ebaySearchUrl } from "@/lib/affiliate";
import type { Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { sealedHistoryRows } from "@/lib/price-history-store";
import { dropLine, rankDrops, realDrop, DROPS_WINDOW_DAYS, type RealDrop } from "@/lib/real-drops";
import type { SealedGroup } from "@/lib/sealed-import";
import { headlineOffer } from "@/lib/sealed-offers";
import { sealedSlug } from "@/lib/sealed-slug";

// The Black Friday / Cyber Monday pages' "furthest under their own 30-day price" list (lib/real-drops.ts holds the rules; code red
// plan 2026-11-20, Cyber Week buy sprint). Reads the sealed price history files bundled with the release (no database read) and the
// groups the page already loaded. The cheapest store a shopper can order from now (never an eBay row) must sit 10%+ under the
// product's own recorded 30-day typical price, with the Black Friday strip's guards against Rift's weeks of wrong-product history.
// Every line: the store's buy button and a tagged eBay search (surface "bf_drops").

const isEbay = (retailer: string) => retailer.startsWith("ebay");

export interface DropRow {
  group: SealedGroup;
  name: string;
  drop: RealDrop;
  offer: SealedGroup["listings"][number];
}

export function realDropRows(groups: readonly SealedGroup[], country: Country, now: Date = new Date(), take = 10): DropRow[] {
  const today = now.toISOString().slice(0, 10);
  let rows: ReturnType<typeof sealedHistoryRows> = [];
  try {
    rows = sealedHistoryRows({ since: new Date(now.getTime() - (DROPS_WINDOW_DAYS + 3) * 86_400_000) });
  } catch {
    return [];
  }
  const byGroup = new Map<string, { day: string; cents: number }[]>();
  for (const r of rows) {
    if (r.country !== country) continue;
    const list = byGroup.get(r.groupKey) ?? [];
    list.push({ day: r.day.toISOString().slice(0, 10), cents: r.lowestPriceCents });
    byGroup.set(r.groupKey, list);
  }
  const out: DropRow[] = [];
  for (const g of groups) {
    const offer = headlineOffer(g.listings.filter((l) => !isEbay(l.retailer)), now.getTime());
    const days = byGroup.get(g.groupKey);
    const drop = offer && days ? realDrop(days, offer.priceCents, today) : null;
    if (offer && drop) out.push({ group: g, name: g.name, drop, offer });
  }
  return rankDrops(out, take);
}

export function RealDrops({ rows, country, currency, page }: { rows: DropRow[]; country: Country; currency: string; page: string }) {
  if (!rows.length) return null;
  const fmt = (c: number) => formatMoney(c, currency);
  return (
    <section id="real-drops" className="mt-6" aria-labelledby="real-drops-h">
      <h2 id="real-drops-h" className="font-display text-xl font-bold text-white">Furthest under their own 30-day price today</h2>
      <p className="mt-1 text-sm text-slate-400">From our daily price records, with a buy button on every line.</p>
      <ol className="mt-3 grid gap-2">
        {rows.map((row, i) => (
          <li key={row.group.groupKey} className="card-surface flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
            <Link href={`/sealed/${sealedSlug(row.group.groupKey)}`} className="min-w-0 flex-1 basis-48 font-semibold text-white hover:text-brand-400">
              {row.name}
              <span className="block text-xs font-normal text-slate-400">{row.group.productType} · {dropLine(row.drop, fmt)}</span>
            </Link>
            <b className="num text-lg font-extrabold text-gold">{fmt(row.offer.priceCents)}</b>
            <span className="flex shrink-0 gap-2">
              <OutboundLink
                href={affiliateUrl(row.offer.url, row.offer.retailer, page)}
                retailer={row.offer.retailer}
                country={country}
                kind="sealed"
                cardName={row.name}
                price={row.offer.priceCents / 100}
                positionInList={i + 1}
                inStock
                pageType={page.replace(/^\//, "").replace(/-/g, "_")}
                surface="bf_drops"
                className="btn-primary px-3 py-1.5 text-xs"
              >
                Buy at {row.offer.retailerName}
              </OutboundLink>
              <OutboundLink
                href={ebaySearchUrl(country, ebaySealedQuery(row.name, row.group.productType), "bf-drops")}
                retailer="ebay_search"
                country={country}
                kind="sealed"
                cardName={row.name}
                pageType={page.replace(/^\//, "").replace(/-/g, "_")}
                surface="bf_drops"
                className="btn-ebay-ghost px-3 py-1.5 text-xs"
              >
                eBay
              </OutboundLink>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        The typical price is the median of the product&rsquo;s cheapest in-stock price in your market on each of the last 30 days we recorded (two weeks of records
        at least; a day far under the rest is left out as a wrong listing, and a product whose records swing more than twofold is not listed). It says what stores
        asked on those days, not what they will charge next. Prices exclude postage. The eBay button is a paid link.
      </p>
      {/* Cyber Weekend (2026-11-21): the Discord hub posts these drops as they happen. */}
      <DiscordCta className="mt-4" />
    </section>
  );
}
