import Link from "next/link";
import type { Country } from "@/lib/country";
import { COUNTRIES } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { sealedPath } from "@/lib/sealed-slug";
import { ebaySearchUrl } from "@/lib/affiliate";
import { EBAY_SITE_LABEL } from "@/lib/ebay-auctions";
import { getPriceWatch } from "@/lib/price-watch-data";
import { OutboundLink } from "@/components/OutboundLink";
import { AffiliateDisclosure, PaidLinkTag } from "@/components/AffiliateDisclosure";

// The price watch sections of /black-friday and /cyber-monday (lib/price-watch.ts
// says what each lists and why). Server-rendered: every row, price and eBay link
// is in the HTML a crawler reads. Each eBay link is one OutboundLink with the
// page's source, labelled "Paid link"; store links are the sealed table's own.
// Drawn after the sealed deals table, never inside it: an eBay row is never a
// store or a deal (2026-09-26 rule).

const SECTION = "card-surface mt-6 p-4 sm:p-5";
const H2 = "font-display text-lg font-extrabold text-white sm:text-xl";
const SUB = "mt-1 text-xs leading-relaxed text-slate-400";
const ROW = "flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/5 py-2.5 first:border-t-0";
const EBAY_BTN = "inline-flex min-h-9 items-center rounded-lg bg-[#0064d2]/15 px-3 text-xs font-bold text-[#8ec5ff] transition-colors hover:bg-[#0064d2]/30";

export async function SalePriceWatch({ country, currency, pageType, source }: { country: Country; currency: string; pageType: string; source: string }) {
  const data = await getPriceWatch(country, source);
  const site = EBAY_SITE_LABEL[country];
  const info = COUNTRIES[country];
  const hasAny = data.sealed.length + data.drops.length + data.graded.length + data.auctions.length > 0;

  return (
    <div id="price-watch">
      <div className="mt-8">
        <h2 className="font-display text-xl font-extrabold text-white sm:text-2xl">Price watch: sealed, price drops, graded and chase</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">
          What the high-value end of the {info.adjective} market asks today, each row ending in a live listing on {site} you can open now.
          Asking prices at our last check, not sales; an eBay seller is never counted as a store or a deal.
        </p>
      </div>

      {!hasAny && (
        <p className={`${SECTION} text-sm text-slate-400`}>
          Nothing to watch in {info.place} right now. The sections fill in on their own from the daily store read and the eBay pass.
        </p>
      )}

      {data.sealed.length > 0 && (
        <section className={SECTION} aria-labelledby="pw-sealed">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="pw-sealed" className={H2}>Sealed boxes: store price beside eBay</h2>
            <PaidLinkTag />
          </div>
          <p className={SUB}>
            Booster boxes and the bigger sealed products in stock today, dearest first: the cheapest {info.adjective} store we track and the cheapest live eBay
            listing side by side. Item prices before postage.
          </p>
          <ul className="mt-3">
            {data.sealed.map((r, i) => (
              <li key={r.group.groupKey} className={ROW}>
                <div className="min-w-0 flex-1">
                  <Link href={sealedPath(r.group.groupKey)} className="block truncate text-sm font-semibold text-white hover:text-brand-400">
                    {r.group.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {r.group.productType}
                    {r.group.storeCount > 0 ? ` · ${r.group.storeCount} store${r.group.storeCount === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <div className="num text-right text-sm">
                  {r.store ? (
                    <>
                      <span className="font-extrabold text-white">{formatMoney(r.store.priceCents, currency)}</span>
                      <span className="block text-[11px] text-slate-500">cheapest store · {r.store.retailerName}</span>
                    </>
                  ) : (
                    <span className="text-xs text-slate-500">No store in stock</span>
                  )}
                </div>
                {r.ebay ? (
                  <OutboundLink
                    href={r.ebay.url}
                    retailer={r.ebay.retailer}
                    country={country}
                    kind="sealed"
                    pageType={pageType}
                    surface="ebay_panel"
                    cardName={r.group.name}
                    price={r.ebay.priceCents / 100}
                    positionInList={i + 1}
                    inStock
                    className={EBAY_BTN}
                  >
                    eBay {formatMoney(r.ebay.priceCents, currency)}
                  </OutboundLink>
                ) : (
                  <OutboundLink
                    href={ebaySearchUrl(country, `Riftbound ${r.group.name}`, `${source}-sealed-search`)}
                    retailer={`ebay_${country.toLowerCase()}`}
                    country={country}
                    kind="sealed"
                    pageType={pageType}
                    surface="ebay_search"
                    cardName={r.group.name}
                    positionInList={i + 1}
                    className={EBAY_BTN}
                  >
                    Search eBay
                  </OutboundLink>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.drops.length > 0 && (
        <section className={SECTION} aria-labelledby="pw-drops">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="pw-drops" className={H2}>Biggest price drops this week</h2>
            <PaidLinkTag />
          </div>
          <p className={SUB}>
            The cards whose cheapest {info.adjective} price fell furthest over the last seven days (the <Link href="/movers" className="text-brand-400 hover:underline">price movers</Link> list), with the cheapest eBay copy we track when there is one.
          </p>
          <ul className="mt-3">
            {data.drops.map((d, i) => (
              <li key={d.mover.card.id} className={ROW}>
                <div className="min-w-0 flex-1">
                  <Link href={cardHref(d.mover.card)} className="block truncate text-sm font-semibold text-white hover:text-brand-400">
                    {d.mover.card.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {d.mover.card.setName} · #{d.mover.card.collectorNumber}
                    {d.mover.card.variant ? ` · ${d.mover.card.variant}` : ""}
                  </p>
                </div>
                <div className="num text-right text-sm">
                  <span className="font-extrabold text-white">{formatMoney(d.mover.nowCents, currency)}</span>
                  <span className="block text-[11px] text-slate-500">
                    <span className="font-semibold text-emerald-400">{Math.round(d.mover.pct)}%</span> vs {formatMoney(d.mover.refCents, currency)} a week ago
                  </span>
                </div>
                {d.ebay ? (
                  <OutboundLink
                    href={d.ebay.url}
                    retailer={d.ebay.retailer}
                    country={country}
                    pageType={pageType}
                    surface="ebay_panel"
                    cardId={d.mover.card.id}
                    cardName={d.mover.card.name}
                    price={d.ebay.priceCents / 100}
                    positionInList={i + 1}
                    inStock
                    className={EBAY_BTN}
                  >
                    eBay {formatMoney(d.ebay.priceCents, currency)}
                    {d.ebay.postageKnown ? " delivered" : ""}
                  </OutboundLink>
                ) : (
                  <OutboundLink
                    href={ebaySearchUrl(country, `Riftbound ${d.mover.card.name} ${d.mover.card.collectorNumber}`, `${source}-drop-search`)}
                    retailer={`ebay_${country.toLowerCase()}`}
                    country={country}
                    pageType={pageType}
                    surface="ebay_search"
                    cardId={d.mover.card.id}
                    cardName={d.mover.card.name}
                    positionInList={i + 1}
                    className={EBAY_BTN}
                  >
                    Search eBay
                  </OutboundLink>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.graded.length > 0 && (
        <section className={SECTION} aria-labelledby="pw-graded">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="pw-graded" className={H2}>Graded cards live on {site}</h2>
            <PaidLinkTag />
          </div>
          <p className={SUB}>
            The dearest live PSA, BGS and CGC slab for each card, one row per card, from the eBay pass that feeds every card page and the{" "}
            <Link href="/graded" className="text-brand-400 hover:underline">graded price guide</Link>. Asking prices; a seller sets them.
          </p>
          <ul className="mt-3">
            {data.graded.map((g, i) => (
              <li key={`${g.card.id}-${g.grade}`} className={ROW}>
                {g.imageUrl ? (
                  <img src={g.imageUrl} alt="" aria-hidden="true" width={36} height={48} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-12 w-9 shrink-0 rounded object-cover" />
                ) : (
                  <span className="h-12 w-9 shrink-0 rounded bg-ink-900" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <Link href={cardHref(g.card)} className="block truncate text-sm font-semibold text-white hover:text-brand-400">
                    {g.card.name}
                  </Link>
                  <p className="truncate text-xs text-slate-500">
                    <span className="font-semibold text-gold">{g.grade}</span> · {g.card.setName} · #{g.card.collectorNumber}
                  </p>
                </div>
                <OutboundLink
                  href={g.url}
                  retailer={`ebay_${country.toLowerCase()}`}
                  country={country}
                  pageType={pageType}
                  surface="ebay_graded"
                  cardId={g.card.id}
                  cardName={g.card.name}
                  price={g.priceCents / 100}
                  positionInList={i + 1}
                  inStock
                  className={EBAY_BTN}
                >
                  {formatMoney(g.priceCents, g.currency)}
                  {g.shippingCents != null && g.shippingCents > 0 ? ` + ${formatMoney(g.shippingCents, g.currency)} post` : ""}
                </OutboundLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.auctions.length > 0 && (
        <section className={SECTION} aria-labelledby="pw-auctions">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="pw-auctions" className={H2}>Chase auctions closing today</h2>
            <PaidLinkTag />
          </div>
          <p className={SUB}>
            The biggest live bids on {site} ending within 24 hours, from the <Link href="/auctions" className="text-brand-400 hover:underline">auctions board</Link>. The bid is what we saw at our last sweep (every four hours); the listing has the live one.
          </p>
          <ul className="mt-3">
            {data.auctions.map((a, i) => (
              <li key={a.itemId} className={ROW}>
                {a.imageUrl ? (
                  <img src={a.imageUrl} alt="" aria-hidden="true" width={36} height={48} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-12 w-9 shrink-0 rounded object-cover" />
                ) : (
                  <span className="h-12 w-9 shrink-0 rounded bg-ink-900" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{a.title}</p>
                  <p className="text-xs text-slate-500">
                    {a.bidCount} bid{a.bidCount === 1 ? "" : "s"}
                    {a.grader ? ` · ${a.grader}${a.grade != null ? ` ${a.grade}` : " graded"}` : ""}
                  </p>
                </div>
                <OutboundLink
                  href={a.url}
                  retailer={`ebay_${country.toLowerCase()}`}
                  country={country}
                  pageType={pageType}
                  surface="ebay_panel"
                  cardName={a.title}
                  price={a.currentBidCents / 100}
                  positionInList={i + 1}
                  inStock
                  className={EBAY_BTN}
                >
                  Bid {formatMoney(a.currentBidCents, a.currency)}
                </OutboundLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasAny && <AffiliateDisclosure partner="ebay" className="mt-3" />}
    </div>
  );
}
