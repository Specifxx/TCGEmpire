import Link from "next/link";
import { Sparkline } from "@/components/PriceChart";
import { OutboundLink } from "@/components/OutboundLink";
import { formatMoney } from "@/lib/format";
import type { Country } from "@/lib/country";
import type { MarketIndex } from "@/lib/market-index";
import type { Deal, TopDeals } from "@/lib/top-deals";

// The homepage's single "signature data moment" — replaces the old PriceWatch +
// the three-times-repeated movers teaser. Left: the live RiftCompare Index (the one
// thing /movers doesn't show). Right: a couple of FREE live opportunities (a price
// drop + the cheapest sealed) — the premium signals stay gated to their tools.
function Delta({ label, pct }: { label: string; pct: number | null }) {
  if (pct == null) return null;
  const up = pct > 0;
  const flat = pct === 0;
  return (
    <span className="inline-flex items-baseline gap-1 rounded-lg bg-ink-900 px-2.5 py-1 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={`font-bold ${flat ? "text-slate-300" : up ? "text-brand-400" : "text-rose-400"}`}>
        {flat ? "—" : `${up ? "▲" : "▼"} ${Math.abs(pct)}%`}
      </span>
    </span>
  );
}

function OppRow({ deal, currency, country }: { deal: Deal; currency: string; country: Country }) {
  const inner = (
    <>
      <div className="h-10 w-8 shrink-0 overflow-hidden rounded bg-ink-900">
        {deal.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={deal.imageUrl} alt="" aria-hidden="true" width={32} height={40} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{deal.title}</div>
        <div className="truncate text-[11px] text-slate-500">
          {deal.subtitle}{deal.note ? ` · ${deal.note}` : ""}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-bold text-accent">{formatMoney(deal.priceCents, currency)}</span>
        {deal.pctLabel != null && (
          <span className="chip bg-brand-500/15 text-brand-300">
            {deal.dealType === "price-drops" ? `▼ ${deal.pctLabel}%` : `${deal.pctLabel}%`}
          </span>
        )}
      </div>
    </>
  );
  const cls = "flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-ink-900/60";
  return deal.outboundUrl ? (
    <OutboundLink href={deal.outboundUrl} retailer={deal.outboundRetailer ?? "sealed"} country={country} kind="sealed" className={cls}>
      {inner}
    </OutboundLink>
  ) : (
    <Link href={deal.href ?? "#"} className={cls}>{inner}</Link>
  );
}

export function MarketPulse({
  index,
  currency,
  deals,
  country,
  place,
}: {
  index: MarketIndex | null;
  currency: string;
  deals: TopDeals;
  country: Country;
  place: string;
}) {
  const opps = [deals.priceDrops[0], deals.cheapestSealed[0]].filter(Boolean) as Deal[];
  if (!index && opps.length === 0) return null;

  return (
    <section className="card-surface relative overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand-500/10 blur-3xl animate-blob" />
        <div className="hero-dots absolute inset-0 opacity-40" />
      </div>

      <div className="relative grid gap-6 md:grid-cols-2">
        {/* Live Index — the whole block is a button through to the full Index. */}
        {index ? (
          <Link href="/market" className="group -m-2 block rounded-xl p-2 transition-colors hover:bg-ink-900/40">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Market Pulse</div>
            <div className="mt-1 flex items-end gap-3">
              <span className="font-display text-4xl font-extrabold text-white transition-colors group-hover:text-brand-300">{index.latest.toFixed(1)}</span>
              <span className="mb-1.5"><Sparkline points={index.points} up={index.d7 != null && index.d7 > 0} upIsGood /></span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Delta label="7d" pct={index.d7} />
              <Delta label="30d" pct={index.d30} />
              <Delta label="All" pct={index.sinceStart} />
            </div>
            <span className="mt-3 inline-block text-sm font-semibold text-brand-400 group-hover:underline">
              The RiftCompare Index →
            </span>
          </Link>
        ) : (
          <div />
        )}

        {/* Live opportunities (free signals only) */}
        {opps.length > 0 && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Live deals in {place}</div>
            <div className="mt-1 divide-y divide-ink-800">
              {opps.map((d, i) => (
                <OppRow key={i} deal={d} currency={currency} country={country} />
              ))}
            </div>
            <Link href="/movers" className="mt-2 inline-block text-sm font-semibold text-brand-400 hover:underline">
              See all movers →
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
