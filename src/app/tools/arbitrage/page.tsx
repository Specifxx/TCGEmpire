import type { Metadata } from "next";
import Link from "next/link";
import { getArbitrage, getArbitrageVsTcgplayer, getEbayCheapest, getArbSources, EBAY_FEE, type ArbSort, type DealSort } from "@/lib/arbitrage";
import { MARKETPLACE_RETAILER } from "@/lib/marketplace";
import { MARKETPLACE_FEE_BPS } from "@/lib/marketplace-policy";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { OutboundLink } from "@/components/OutboundLink";
import { PremiumButton } from "@/components/PremiumButton";
import { RegionToggle } from "@/components/RegionToggle";
import { ArbitrageFilters } from "@/components/ArbitrageFilters";
import { CardQuickLink } from "@/components/CardQuickLink";
import type { CardTileData } from "@/components/CardTile";
import { SITE_URL } from "@/lib/site";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Riftbound Deal Finder — Cross-Store, eBay & TCGplayer Deals | RiftCompare" },
  description:
    "Find the best Riftbound deals: cards worth more on eBay than in stores (handy if you're selling), cards underpriced vs TCGplayer's US market price, and the cards eBay is cheapest to buy. Sortable, updated daily, with direct links. A Premium tool — the top pick is free to preview.",
  alternates: { canonical: "/tools/arbitrage" },
  openGraph: { title: "Riftbound Deal Finder — Cross-Store, eBay & TCGplayer Deals", url: `${SITE_URL}/tools/arbitrage` },
};

const PAGE_SIZE = 25;
// Non-Premium visitors get the top opportunity clear + a few blurred rows behind
// the upsell. We deliberately fetch only this many so the full list never ships
// to the client to be un-blurred.
const TEASER_SIZE = 6;
const FLIP_SORTS: { key: ArbSort; label: string }[] = [
  { key: "profit", label: "Biggest gap" },
  { key: "margin", label: "Best % gap" },
];
const DEAL_SORTS: { key: DealSort; label: string }[] = [
  { key: "saving", label: "Biggest saving" },
  { key: "pct", label: "Best % off" },
];

export default async function ArbitragePage({
  searchParams,
}: {
  searchParams: { sort?: string; page?: string; buy?: string; view?: string };
}) {
  const user = await getCurrentUser();
  const premium = isPremium(user);
  const signedIn = !!user;
  const country = getCountry();
  const info = COUNTRIES[country];
  const sources = getArbSources(country);
  const storeKeys = sources.filter((s) => !s.isEbay).map((s) => s.key);
  const ebay = sources.find((s) => s.isEbay);
  const marketplace = sources.find((s) => s.key === MARKETPLACE_RETAILER[country]);
  const view: "flip" | "deals" | "tcg" =
    searchParams.view === "deals" ? "deals" : searchParams.view === "tcg" ? "tcg" : "flip";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  return (
    <div className="mx-auto max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
                { "@type": "ListItem", position: 2, name: "Tools", item: `${SITE_URL}/tools` },
                { "@type": "ListItem", position: 3, name: "Deal Finder", item: `${SITE_URL}/tools/arbitrage` },
              ],
            },
            {
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Riftbound Deal Finder — Cross-Store & eBay Deals",
              url: `${SITE_URL}/tools/arbitrage`,
              applicationCategory: "UtilitiesApplication",
              operatingSystem: "Web",
              offers: { "@type": "Offer", price: "0", priceCurrency: info.currency },
              description:
                "Find Riftbound cards worth more on eBay than in stores, plus the cards eBay is cheapest to buy.",
            },
          ]),
        }}
      />
      <div className="mb-4">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">Deal Finder</span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Deal Finder</h1>
          <RegionToggle />
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1" role="tablist" aria-label="Views">
        <Link
          href="/tools/arbitrage"
          aria-current={view === "flip" ? "page" : undefined}
          className={`flex-1 rounded-md px-3 py-2 text-center text-sm font-bold ${view === "flip" ? "bg-brand-500/20 text-brand-200" : "text-slate-400 hover:text-white"}`}
        >
          Worth more on eBay
        </Link>
        <Link
          href="/tools/arbitrage?view=tcg"
          aria-current={view === "tcg" ? "page" : undefined}
          className={`flex-1 rounded-md px-3 py-2 text-center text-sm font-bold ${view === "tcg" ? "bg-gold/20 text-gold" : "text-slate-400 hover:text-white"}`}
        >
          Underpriced vs TCGplayer
        </Link>
        <Link
          href="/tools/arbitrage?view=deals"
          aria-current={view === "deals" ? "page" : undefined}
          className={`flex-1 rounded-md px-3 py-2 text-center text-sm font-bold ${view === "deals" ? "bg-sky-500/20 text-sky-200" : "text-slate-400 hover:text-white"}`}
        >
          Cheapest on eBay
        </Link>
      </div>

      {view === "tcg" ? (
        await TcgFlipView({ country, info, sort: searchParams.sort === "margin" ? "margin" : "profit", page, storeKeys, premium, signedIn })
      ) : view === "deals" ? (
        !ebay ? (
          <div className="card-surface grid place-items-center p-12 text-center text-sm text-slate-400">
            This view isn&apos;t available in {info.place} yet — it&apos;s eBay-based, and eBay doesn&apos;t cover this market.
          </div>
        ) : (
          await DealsView({ country, info, sort: searchParams.sort === "pct" ? "pct" : "saving", page, premium, signedIn })
        )
      ) : !ebay && !marketplace ? (
        <div className="card-surface grid place-items-center p-12 text-center text-sm text-slate-400">
          This view isn&apos;t available in {info.place} yet — it needs eBay or marketplace coverage, and neither is available here.
        </div>
      ) : (
        await FlipView({
          country, info, sort: searchParams.sort === "margin" ? "margin" : "profit", page, buy: searchParams.buy,
          sources, ebayKey: ebay?.key, marketplaceKey: marketplace?.key, storeKeys, premium, signedIn,
        })
      )}
    </div>
  );
}

// ── Flip view (buy store → sell eBay / the RiftCompare Marketplace) ─────────────
async function FlipView({
  country,
  info,
  sort,
  page,
  buy: buyParam,
  sources,
  ebayKey,
  marketplaceKey,
  storeKeys,
  premium,
  signedIn,
}: {
  country: ReturnType<typeof getCountry>;
  info: (typeof COUNTRIES)[keyof typeof COUNTRIES];
  sort: ArbSort;
  page: number;
  buy?: string;
  sources: ReturnType<typeof getArbSources>;
  ebayKey?: string;
  marketplaceKey?: string;
  storeKeys: string[];
  premium: boolean;
  signedIn: boolean;
}) {
  const buy = buyParam ? buyParam.split(",").map((s) => s.trim()).filter(Boolean) : storeKeys;
  const sell = [ebayKey, marketplaceKey].filter((k): k is string => !!k);
  // Non-Premium: ignore page/source customisation and fetch only the teaser.
  const data = await getArbitrage(country, {
    buy,
    sort,
    sell,
    page: premium ? page : 1,
    pageSize: premium ? PAGE_SIZE : TEASER_SIZE,
  });
  const href = (p: number) => `/tools/arbitrage?buy=${buy.join(",")}&sort=${sort}&page=${p}`;
  const sortHref = (s: ArbSort) => `/tools/arbitrage?buy=${buy.join(",")}&sort=${s}&page=1`;
  const sellLabel = ebayKey && marketplaceKey ? "eBay or the RiftCompare Marketplace" : marketplaceKey ? "the RiftCompare Marketplace" : "eBay";
  const feeParts = [
    ebayKey ? `~${Math.round(EBAY_FEE * 100)}% eBay fee` : null,
    marketplaceKey ? `${MARKETPLACE_FEE_BPS / 100}% marketplace fee` : null,
  ].filter(Boolean);

  return (
    <>
      <p className="mb-2 max-w-2xl text-sm leading-relaxed text-slate-400">
        Cards that sell for more on <strong className="text-slate-200">{sellLabel}</strong> than a {info.adjective} store charges —
        handy if you&apos;re deciding whether to sell one. The gap is after an estimated {feeParts.join(" / ")}; postage isn&apos;t included.
      </p>
      {!marketplaceKey && (
        <p className="mb-4 text-xs text-slate-500">
          eBay is the only resale channel we can price right now in {info.place}. Know another store that buys cards?{" "}
          <Link href="/contact" className="text-brand-400 hover:underline">Email us</Link> and we&apos;ll add it as a sell option.
        </p>
      )}

      {premium && (
        <div className="card-surface mb-4 flex flex-wrap items-end justify-between gap-4 p-4">
          <ArbitrageFilters sources={sources} buy={buy} sell={sell} sort={sort} />
          <SortTabs sorts={FLIP_SORTS} active={sort} hrefFor={sortHref} />
        </div>
      )}

      {data.items.length === 0 ? (
        <Empty>No cards worth more on eBay from these sources right now in {info.place}. Try widening the store side.</Empty>
      ) : premium ? (
        <>
          <div className="card-surface overflow-x-auto">
            <FlipTable items={data.items} country={country} info={info} />
          </div>
          <Pager total={data.total} page={data.page} pageCount={data.pageCount} hrefFor={href} unit="cards" />
        </>
      ) : (
        <LockedTable signedIn={signedIn}>
          <FlipTable items={data.items} country={country} info={info} />
        </LockedTable>
      )}
    </>
  );
}

// ── Deals view (cards eBay is cheapest to buy) ───────────────────────────────────
async function DealsView({
  country,
  info,
  sort,
  page,
  premium,
  signedIn,
}: {
  country: ReturnType<typeof getCountry>;
  info: (typeof COUNTRIES)[keyof typeof COUNTRIES];
  sort: DealSort;
  page: number;
  premium: boolean;
  signedIn: boolean;
}) {
  const data = await getEbayCheapest(country, sort, premium ? page : 1, premium ? PAGE_SIZE : TEASER_SIZE);
  const href = (p: number) => `/tools/arbitrage?view=deals&sort=${sort}&page=${p}`;
  const sortHref = (s: DealSort) => `/tools/arbitrage?view=deals&sort=${s}&page=1`;

  return (
    <>
      <p className="mb-4 max-w-2xl text-sm leading-relaxed text-slate-400">
        Cards where <strong className="text-slate-200">eBay is the cheapest place to buy</strong> — its price beats every{" "}
        {info.adjective} store we track. Grab the deal on eBay, or open the card to compare every option.
      </p>

      {premium && (
        <div className="card-surface mb-4 flex flex-wrap items-center justify-end gap-4 p-4">
          <SortTabs sorts={DEAL_SORTS} active={sort} hrefFor={sortHref} />
        </div>
      )}

      {data.items.length === 0 ? (
        <Empty>No cards are cheaper on eBay than in stores right now in {info.place}.</Empty>
      ) : premium ? (
        <>
          <div className="card-surface overflow-x-auto">
            <DealsTable items={data.items} country={country} info={info} />
          </div>
          <Pager total={data.total} page={data.page} pageCount={data.pageCount} hrefFor={href} unit="deals" />
          <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
            eBay / store are the cheapest current in-stock prices. eBay postage isn&apos;t included; thin or one-off listings
            can mislead — open the card to see every option before buying.
          </p>
        </>
      ) : (
        <LockedTable signedIn={signedIn}>
          <DealsTable items={data.items} country={country} info={info} />
        </LockedTable>
      )}
    </>
  );
}

// ── TCGplayer flip view (buy store → sell benchmark = TCGplayer US market price) ──
// A second flip benchmark alongside eBay: TCGplayer's own market price (converted to
// the local currency) instead of the cheapest current eBay listing. Available in
// every market — including ones with no eBay coverage (e.g. NZ) — since it isn't
// eBay-based at all.
async function TcgFlipView({
  country,
  info,
  sort,
  page,
  storeKeys,
  premium,
  signedIn,
}: {
  country: ReturnType<typeof getCountry>;
  info: (typeof COUNTRIES)[keyof typeof COUNTRIES];
  sort: ArbSort;
  page: number;
  storeKeys: string[];
  premium: boolean;
  signedIn: boolean;
}) {
  const data = await getArbitrageVsTcgplayer(country, {
    buy: storeKeys,
    sort,
    page: premium ? page : 1,
    pageSize: premium ? PAGE_SIZE : TEASER_SIZE,
  });
  const href = (p: number) => `/tools/arbitrage?view=tcg&sort=${sort}&page=${p}`;
  const sortHref = (s: ArbSort) => `/tools/arbitrage?view=tcg&sort=${s}&page=1`;

  return (
    <>
      <p className="mb-2 max-w-2xl text-sm leading-relaxed text-slate-400">
        Cards a {info.adjective} store is selling for less than <strong className="text-slate-200">TCGplayer&apos;s</strong> own
        US market price (converted to {info.currency}) — i.e. underpriced relative to the wider US market. TCGplayer only
        tracks one market price per card, so this is a reference gap, not a fee-adjusted resale estimate — shipping a card
        there means a genuine US-bound sale.
      </p>
      <p className="mb-4 text-xs text-slate-500">
        Currency conversion is an approximate reference rate, not a live FX quote — see the card page for the real,
        in-market prices we track.
      </p>

      {premium && (
        <div className="card-surface mb-4 flex flex-wrap items-end justify-end gap-4 p-4">
          <SortTabs sorts={FLIP_SORTS} active={sort} hrefFor={sortHref} />
        </div>
      )}

      {data.items.length === 0 ? (
        <Empty>No cards look underpriced vs TCGplayer from these stores right now in {info.place}.</Empty>
      ) : premium ? (
        <>
          <div className="card-surface overflow-x-auto">
            <FlipTable items={data.items} country={country} info={info} />
          </div>
          <Pager total={data.total} page={data.page} pageCount={data.pageCount} hrefFor={href} unit="cards" />
        </>
      ) : (
        <LockedTable signedIn={signedIn}>
          <FlipTable items={data.items} country={country} info={info} />
        </LockedTable>
      )}
    </>
  );
}

// ── Tables (shared between the Premium list and the blurred teaser) ───────────────
function FlipTable({
  items,
  country,
  info,
}: {
  items: Awaited<ReturnType<typeof getArbitrage>>["items"];
  country: ReturnType<typeof getCountry>;
  info: (typeof COUNTRIES)[keyof typeof COUNTRIES];
}) {
  return (
    <table className="w-full min-w-[700px] text-sm">
      <thead>
        <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
          <th className="px-4 py-2.5 font-semibold">Card</th>
          <th className="px-2 py-2.5 text-right font-semibold">Buy</th>
          <th className="px-2 py-2.5 text-right font-semibold">Sell</th>
          <th className="px-2 py-2.5 text-right font-semibold">Net profit</th>
          <th className="px-4 py-2.5 text-right font-semibold">Margin</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-ink-800">
        {items.map((it) => (
          <tr key={it.card.id} className="hover:bg-ink-800">
            <CardCell card={it.card} />
            <td className="px-2 py-2 text-right">
              <OutboundLink href={it.buyUrl} retailer={it.buyStore} country={country} className="num font-semibold text-white hover:text-brand-400">
                {formatMoney(it.buyCents, info.currency)}
              </OutboundLink>
              <div className="truncate text-[10px] text-slate-500" title={it.buyStoreName}>{it.buyStoreName}</div>
            </td>
            <td className="px-2 py-2 text-right">
              <OutboundLink href={it.sellUrl} retailer={it.sellRetailer} country={country} className="num font-semibold text-slate-200 hover:text-brand-400">
                {formatMoney(it.sellCents, info.currency)}
              </OutboundLink>
              <div className="text-[10px] text-sky-400">{it.sellName}</div>
            </td>
            <td className="num px-2 py-2 text-right font-bold text-up">+{formatMoney(it.netCents, info.currency)}</td>
            <td className="num px-4 py-2 text-right font-semibold text-up">{it.marginPct}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DealsTable({
  items,
  country,
  info,
}: {
  items: Awaited<ReturnType<typeof getEbayCheapest>>["items"];
  country: ReturnType<typeof getCountry>;
  info: (typeof COUNTRIES)[keyof typeof COUNTRIES];
}) {
  return (
    <table className="w-full min-w-[640px] text-sm">
      <thead>
        <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
          <th className="px-4 py-2.5 font-semibold">Card</th>
          <th className="px-2 py-2.5 text-right font-semibold">eBay</th>
          <th className="px-2 py-2.5 text-right font-semibold">Cheapest store</th>
          <th className="px-4 py-2.5 text-right font-semibold">You save</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-ink-800">
        {items.map((it) => (
          <tr key={it.card.id} className="hover:bg-ink-800">
            <CardCell card={it.card} />
            <td className="px-2 py-2 text-right">
              <OutboundLink href={it.ebayUrl} retailer="ebay_deal" country={country} className="num font-semibold text-sky-300 hover:text-sky-200">
                {formatMoney(it.ebayCents, info.currency)}
              </OutboundLink>
              <div className="text-[10px] text-sky-400">on eBay →</div>
            </td>
            <td className="px-2 py-2 text-right">
              <div className="num text-slate-300">{formatMoney(it.storeCents, info.currency)}</div>
              <div className="truncate text-[10px] text-slate-500" title={it.storeName}>{it.storeName}</div>
            </td>
            <td className="px-4 py-2 text-right">
              <span className="num font-bold text-up">{formatMoney(it.savingCents, info.currency)}</span>
              <span className="num ml-1 text-[11px] font-semibold text-up">({it.savingPct}%)</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────────
// Premium gate: the first table row stays sharp and clickable; every row after it
// is blurred and inert, with the upsell card floating over the fade.
function LockedTable({ children, signedIn }: { children: React.ReactNode; signedIn: boolean }) {
  return (
    <div className="relative">
      <div className="card-surface overflow-x-auto [&_tbody_tr:not(:first-child)]:pointer-events-none [&_tbody_tr:not(:first-child)]:select-none [&_tbody_tr:not(:first-child)]:blur-[5px]">
        {children}
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-gradient-to-b from-transparent via-ink-900/70 to-ink-900/95 p-5">
        <div className="pointer-events-auto mx-auto max-w-sm rounded-lg border border-ink-700 bg-ink-900/95 p-5 text-center">
          <h2 className="text-base font-extrabold text-white">The full list is a Premium feature</h2>
          <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-400">
            The top opportunity is on us. Unlock every flip and deal — all sources, sortable and paginated, updated daily — with Premium.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {signedIn ? (
              <PremiumButton />
            ) : (
              <Link href="/register?next=/tools/arbitrage" className="btn-primary text-sm">Create a free account</Link>
            )}
            <Link href="/movers" className="btn-ghost text-sm">Free price movers →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardCell({ card }: { card: CardTileData }) {
  return (
    <td className="px-4 py-2">
      <CardQuickLink card={card} className="flex items-center gap-2.5">
        {card.imageThumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.imageThumbUrl} alt="" aria-hidden="true" width={28} height={39} loading="lazy" decoding="async" className="h-10 w-7 shrink-0 rounded-sm object-cover" />
        )}
        <span className="min-w-0">
          <span className="block truncate font-semibold text-white">{card.name}</span>
          <span className="block text-[11px] text-slate-500">{card.setCode} · {card.collectorNumber}</span>
        </span>
      </CardQuickLink>
    </td>
  );
}

function SortTabs<T extends string>({ sorts, active, hrefFor }: { sorts: { key: T; label: string }[]; active: T; hrefFor: (s: T) => string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sort</div>
      <div className="mt-0.5 flex gap-1">
        {sorts.map((s) => (
          <Link
            key={s.key}
            href={hrefFor(s.key)}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${active === s.key ? "bg-brand-500/20 text-brand-200" : "bg-ink-900 text-slate-400 hover:text-white"}`}
          >
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card-surface grid place-items-center p-12 text-center text-sm text-slate-400">{children}</div>;
}

function Pager({ total, page, pageCount, hrefFor, unit }: { total: number; page: number; pageCount: number; hrefFor: (p: number) => string; unit: string }) {
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-xs text-slate-500">{total} {unit} · page {page} of {pageCount}</span>
      <div className="flex gap-2">
        {page > 1 && <Link href={hrefFor(page - 1)} className="btn-ghost text-sm">← Prev</Link>}
        {page < pageCount && <Link href={hrefFor(page + 1)} className="btn-ghost text-sm">Next →</Link>}
      </div>
    </div>
  );
}
