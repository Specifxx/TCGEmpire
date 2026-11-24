"use client";

// The Black Friday / Cyber Monday pages' ONE deal list (lib/sale-deals.ts; owner's review, 2026-11-24). The server renders it with
// the default filters, so the first screen of the HTML already holds deal rows; the toggle, filters and sort then run in the browser
// over the same rows (no request). Every row: a 64-72px thumbnail on a white tile, the name, a discount badge, today's price with the
// reference price struck through, "checked N h ago" (flagged past 12 hours), a 30-day sparkline, the store's buy button (primary)
// and an eBay text link (secondary). After the fifth row, one slim bar of alerts (Discord, Telegram). Buy clicks carry the
// buy-click beacon's data-* attributes, surface "bf_list".
import Link from "next/link";
import { useMemo, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { formatMoney } from "@/lib/format";
import { dropDate } from "@/lib/real-drops";
import { OutboundLink } from "@/components/OutboundLink";
import { applyFilters, DEFAULT_FILTERS, isStale, pctOn, PRICE_BANDS, refCents, sparkPath, typesOf, type SaleBasis, type SaleDealRow, type SaleFilters } from "@/lib/sale-deals";

const PAGE = 20;
const ALERT_AFTER = 5;

const BASIS_LABEL: Record<SaleBasis, { tab: string; badge: string; ref: string; tip: string }> = {
  typical: {
    tab: "Biggest price drops",
    badge: "30-day typical",
    ref: "30-day typical",
    tip: "Against the product's own typical price: the median of its cheapest in-stock price in your market on each of the last 30 days we recorded (two weeks of records at least; a day far under the rest is left out as a wrong listing).",
  },
  median: {
    tab: "Under other stores today",
    badge: "median",
    ref: "store median",
    tip: "Against the middle price of the stores that have it open in your market today (three or more stores, at least 10% under, never half: that is a wrong listing).",
  },
  msrp: {
    tab: "Under MSRP",
    badge: "MSRP",
    ref: "MSRP",
    tip: "Against its MSRP in your market: at least 5% under.",
  },
};

function ago(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (!Number.isFinite(m)) return "";
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)} days ago`;
}

export function SaleDeals({ rows, country, currency, page, discordHref, telegramHref }: { rows: SaleDealRow[]; country: string; currency: string; page: string; discordHref: string | null; telegramHref: string }) {
  const [f, setF] = useState<SaleFilters>(() => ({ ...DEFAULT_FILTERS, basis: rows.some((r) => r.typical) ? "typical" : rows.some((r) => r.median) ? "median" : "msrp" }));
  const [shown, setShown] = useState(PAGE);
  const list = useMemo(() => applyFilters(rows, f), [rows, f]);
  const types = useMemo(() => typesOf(rows, f.basis), [rows, f.basis]);
  const fmt = (c: number) => formatMoney(c, currency);
  const set = (patch: Partial<SaleFilters>) => {
    setF((x) => ({ ...x, ...patch }));
    setShown(PAGE);
    trackEvent("bf_filter", { page, key: Object.keys(patch)[0] ?? "", value: String(Object.values(patch)[0] ?? "") });
  };
  const counts = { typical: rows.filter((r) => r.typical).length, median: rows.filter((r) => r.median).length, msrp: rows.filter((r) => r.msrp).length };
  const bases = (["typical", "median", "msrp"] as const).filter((b) => counts[b] > 0);
  const sel = "min-h-11 rounded-lg border border-ink-700 bg-ink-900 px-2.5 text-sm text-slate-200";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {bases.length > 1 ? (
          <div role="tablist" aria-label="Compare against" className="inline-flex rounded-xl border border-ink-700 p-1">
            {bases.map((b) => (
              <button
                key={b}
                role="tab"
                type="button"
                aria-selected={f.basis === b}
                onClick={() => set({ basis: b })}
                className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${f.basis === b ? "bg-brand-500 text-white" : "text-slate-400 hover:text-white"}`}
              >
                {BASIS_LABEL[b].tab} <span className="tabular-nums font-normal opacity-80">({counts[b]})</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm font-semibold">{BASIS_LABEL[f.basis].tab}</p>
        )}
        <details className="text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-slate-400 hover:text-white">
            <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full border border-current text-[11px] font-bold">i</span>
            How we calculate
          </summary>
          <p className="mt-2 max-w-xl text-xs leading-5 text-slate-400">{BASIS_LABEL[f.basis].tip} Prices exclude postage, as the store asked when we last read it.</p>
        </details>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Filter and sort the deals">
        {types.length > 1 && (
          <>
            <label className="sr-only" htmlFor="bf-type">Product type</label>
            <select id="bf-type" className={sel} value={f.type} onChange={(e) => set({ type: e.target.value })}>
              <option value="">All product types</option>
              {types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </>
        )}
        <label className="sr-only" htmlFor="bf-band">Price</label>
        <select id="bf-band" className={sel} value={f.band} onChange={(e) => set({ band: e.target.value as SaleFilters["band"] })}>
          <option value="">Any price</option>
          {PRICE_BANDS.map((b) => (
            <option key={b.key} value={b.key}>
              {b.max === Infinity ? `${fmt(b.min)}+` : b.min === 0 ? `Under ${fmt(b.max)}` : `${fmt(b.min)}–${fmt(b.max)}`}
            </option>
          ))}
        </select>
        {rows.some((r) => r.preorder) && (
          <>
            <label className="sr-only" htmlFor="bf-stock">Availability</label>
            <select id="bf-stock" className={sel} value={f.stock} onChange={(e) => set({ stock: e.target.value as SaleFilters["stock"] })}>
              <option value="all">In stock and pre-order</option>
              <option value="now">In stock</option>
              <option value="pre">Pre-order</option>
            </select>
          </>
        )}
        <label className="sr-only" htmlFor="bf-sort">Sort</label>
        <select id="bf-sort" className={sel} value={f.sort} onChange={(e) => set({ sort: e.target.value as SaleFilters["sort"] })}>
          <option value="pct">Sort: % off</option>
          <option value="price">Sort: price, low to high</option>
        </select>
      </div>

      {list.length ? (
        <ol className="mt-4 grid gap-2">
          {list.slice(0, shown).map((row, i) => (
            <SaleRow key={row.slug} row={row} basis={f.basis} fmt={fmt} page={page} country={country} position={i + 1} alertBar={i === ALERT_AFTER - 1} discordHref={discordHref} telegramHref={telegramHref} />
          ))}
        </ol>
      ) : (
        <p className="mt-4 rounded-xl border border-ink-800 px-4 py-6 text-sm text-slate-400">No deal matches these filters right now. Try another product type or price.</p>
      )}
      {list.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="mt-3 min-h-11 w-full rounded-lg border border-ink-700 px-4 text-sm font-semibold hover:bg-ink-800 sm:w-auto">
          Show {Math.min(PAGE, list.length - shown)} more of {list.length}
        </button>
      )}
    </div>
  );
}

function SaleRow({ row, basis, fmt, page, country, position, alertBar, discordHref, telegramHref }: { row: SaleDealRow; basis: SaleBasis; fmt: (c: number) => string; page: string; country: string; position: number; alertBar: boolean; discordHref: string | null; telegramHref: string }) {
  const pct = pctOn(row, basis);
  const ref = refCents(row, basis);
  const stale = isStale(row.checkedAt);
  const path = sparkPath(row.spark, 72, 22);
  return (
    <>
      <li className="grid grid-cols-[64px_1fr] gap-x-3 gap-y-2 rounded-xl border border-ink-800 bg-ink-900/60 p-3 sm:grid-cols-[72px_minmax(0,1fr)_96px_9.5rem_8.5rem] sm:items-center sm:gap-x-4">
        <div className="row-span-2 grid h-16 w-16 place-items-center overflow-hidden rounded-lg bg-white sm:row-span-1 sm:h-[72px] sm:w-[72px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- store photos are hotlinked, no image optimisation (cost) */}
          {row.imageUrl ? <img src={row.imageUrl} alt={row.name} width={72} height={72} loading="lazy" decoding="async" className="h-full w-full object-contain p-1" /> : null}
        </div>
        <div className="min-w-0">
          <Link href={`/sealed/${row.slug}`} prefetch={false} className="block font-semibold leading-snug text-white hover:text-brand-400">
            {row.name}
          </Link>
          <span className="mt-0.5 block text-xs text-slate-400">
            {row.productType}
            {row.preorder ? " · Pre-order" : ""}
            {basis === "typical" && row.typical?.lowest ? ` · lowest since ${dropDate(row.typical.sinceDay)}` : ""}
          </span>
          <span className={`mt-0.5 block text-xs ${stale ? "font-semibold text-amber-400" : "text-slate-400"}`}>
            {stale ? "Price checked " : "Checked "}
            <time dateTime={row.checkedAt} suppressHydrationWarning>
              {ago(row.checkedAt)}
            </time>
            {stale ? ": check the store before you buy" : ""}
          </span>
        </div>
        <div className="col-start-2 sm:col-start-auto" aria-hidden={!path}>
          {path ? (
            <svg width="72" height="22" viewBox="0 0 72 22" role="img" aria-label={`${row.name}: cheapest listing over the last 30 days`} className="text-brand-400">
              <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          ) : null}
        </div>
        <div className="col-span-2 flex flex-wrap items-baseline gap-x-2 sm:col-span-1 sm:block sm:text-right">
          {pct != null && <span title={BASIS_LABEL[basis].tip} className="mr-1 inline-block rounded-md bg-emerald-600 px-1.5 py-0.5 text-sm font-bold text-white sm:mb-1">{pct}% under {BASIS_LABEL[basis].badge}</span>}
          <b className="num text-xl font-extrabold text-gold">{fmt(row.priceCents)}</b>
          {ref != null && (
            <s className="ml-1 text-sm tabular-nums text-slate-400" title={BASIS_LABEL[basis].ref}>
              <span className="sr-only">{BASIS_LABEL[basis].ref} </span>
              {fmt(ref)}
            </s>
          )}
          <span className="block w-full text-xs text-slate-400">Shipping at checkout</span>
        </div>
        <div className="col-span-2 flex items-center gap-3 sm:col-span-1 sm:flex-col sm:items-stretch sm:gap-1">
          <OutboundLink
            href={row.buyHref}
            retailer={row.retailer}
            country={country}
            kind="sealed"
            cardName={row.name}
            price={row.priceCents / 100}
            positionInList={position}
            inStock
            pageType={page.replace(/^\//, "").replace(/-/g, "_")}
            surface="bf_list"
            className="btn-primary min-h-11 flex-1 truncate px-3 text-center text-sm sm:flex-none"
            aria-label={`Buy ${row.name} at ${row.storeName}`}
          >
            Buy at {row.storeName}
          </OutboundLink>
          <OutboundLink
            href={row.ebayHref}
            retailer="ebay_search"
            country={country}
            kind="sealed"
            cardName={row.name}
            pageType={page.replace(/^\//, "").replace(/-/g, "_")}
            surface="bf_list"
            className="min-h-11 shrink-0 content-center text-center text-xs font-semibold text-slate-400 underline underline-offset-2 hover:text-white sm:min-h-0"
            aria-label={`${row.name} on eBay (paid link)`}
          >
            or on eBay
          </OutboundLink>
        </div>
      </li>
      {alertBar && (discordHref || telegramHref) && (
        <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-ink-700 px-3 py-2 text-sm" aria-label="Deal alerts">
          <span className="font-semibold">Get new deals as they land, free:</span>
          {discordHref && (
            <a href={discordHref} target="_blank" rel="noopener noreferrer" className="min-h-11 content-center font-semibold text-[#8ea1ff] underline underline-offset-2">
              Discord
            </a>
          )}
          <a href={telegramHref} target="_blank" rel="noopener noreferrer" className="min-h-11 content-center font-semibold text-[#5fc3f0] underline underline-offset-2">
            Telegram
          </a>
          <a href="/alerts" className="min-h-11 content-center font-semibold text-brand-400 underline underline-offset-2">
            Email alerts
          </a>
        </li>
      )}
    </>
  );
}
