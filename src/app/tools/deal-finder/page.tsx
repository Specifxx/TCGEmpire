import type { Metadata } from "next";
import { HubIntro } from "@/components/HubIntro";
import Link from "next/link";
import { getArbitrage, getArbitrageVsTcgplayer, getEbayCheapest, getCrossRegionGaps, getArbSources, TCGPLAYER_KEY, EBAY_FEE, type ArbSort, type DealSort } from "@/lib/arbitrage";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { OutboundLink } from "@/components/OutboundLink";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { PremiumButton } from "@/components/PremiumButton";
import { PremiumNavLink } from "@/components/PremiumNavLink";
import { RegionToggle } from "@/components/RegionToggle";
import { ArbitrageFilters } from "@/components/ArbitrageFilters";
import { CardQuickLink } from "@/components/CardQuickLink";
import type { CardTileData } from "@/components/CardTile";
import { SITE_URL } from "@/lib/site";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense";
import { cardImageAlt } from "@/lib/image-alt";
import { pageAlternates } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Riftbound Deal Finder — Cross-Store, eBay & TCGplayer Deals | RiftCompare" },
  description:
    "Find the best Riftbound deals: cards underpriced vs TCGplayer's US market price, cards worth more on eBay than in stores (handy if you're selling), the cards eBay is cheapest to buy, and cards priced meaningfully cheaper in another tracked market. Sortable, updated daily, with direct links. Free accounts see the top three in each view; Premium unlocks every deal.",
  alternates: pageAlternates("/tools/deal-finder"),
  openGraph: { title: "Riftbound Deal Finder — Cross-Store, eBay & TCGplayer Deals", url: `${SITE_URL}/tools/deal-finder` },
};

const PAGE_SIZE = 25;
// THREE LEVELS OF ACCESS (2026-09-23; DECISIONS.md, "Premium after sign-up").
//
//   full — Premium/Plus (and ADSENSE_REVIEW_MODE): every row, the filters,
//          every page.
//   top3 — a signed-in FREE account: the first FREE_PREVIEW_ROWS rows of each
//          view's DEFAULT ranking, and a count of how many more Premium shows.
//          Owner, 2026-09-23: "even if free accounts get to see the top 3".
//          This reverses the 2026-09-22 "free accounts get nothing" for signed-
//          in accounts only — it gives the free account a concrete reason to
//          exist, and the tool a way to show a free user what it finds before
//          asking them to pay for the rest.
//   none — signed out: NO QUERY AT ALL, and <LockedPreview /> asks for a free
//          account ("see the top 3 free").
//
// The top 3 is limited in the QUERY (pageSize: FREE_PREVIEW_ROWS), never in
// CSS. The pre-2026-09-22 teaser fetched six rows and blurred five, so the
// "locked" rows sat in the server HTML for anyone who opened devtools; nothing
// beyond the three rows a free account is entitled to may reach the page. The
// ranking aggregates are day-cached (lib/arbitrage.ts cachedOrDirect), so a
// free view costs one cached read plus a three-card detail lookup. The prose
// above each table stays: it is what the page is about, and what keeps an
// indexable page from being thin (docs/adsense-remediation.md § 9).
const FREE_PREVIEW_ROWS = 3;
type ToolAccess = "full" | "top3" | "none";
const FLIP_SORTS: { key: ArbSort; label: string }[] = [
  { key: "profit", label: "Biggest gap" },
  { key: "margin", label: "Best % gap" },
];
// Explains the four views in plain words, and — the reason it was added on
// 2026-09-22 — keeps this page from going thin the moment its tables are gated.
// Free visitors now see no rows at all, and the four view intros are the only
// prose on the page; a single view's intro is well under the 150-word floor the
// AdSense audit treats as thin content, on a page sitting in the sitemap at
// priority 0.7. Every answer here is a fact already stated elsewhere in this
// file or in lib/arbitrage.ts, written out for a reader rather than inferred
// from a table. Rendered visibly AND as FAQPage JSON-LD from the same array,
// the way /tools/rising does it, so the two can never drift apart.
const DEAL_FAQS = [
  {
    q: "What does Deal Finder actually compare?",
    a: "Four things, each on its own tab: cards a store or eBay is selling below TCGplayer's US market price; cards worth more on eBay than the cheapest store charges, which matters if you are selling; the cards eBay is currently the cheapest place to buy; and cards priced meaningfully lower in another market we track than in yours.",
  },
  {
    q: "How often do the numbers update?",
    a: "Daily. Every figure comes from the same store and eBay prices the rest of the site runs on, refreshed on the daily import, so a deal here is a live in-stock price rather than a historical average.",
  },
  {
    q: "Do the gaps include postage and fees?",
    a: "Partly, and the page says which is which. The eBay resale gap is shown after an estimated eBay fee but before postage. The TCGplayer comparison includes eBay's real quoted shipping on eBay's side; store postage is usually unknown until checkout, so those stay item-price-only. Cross-market gaps ignore international shipping and customs entirely — check both before buying.",
  },
  {
    q: "Is a big gap always a good deal?",
    a: "No. A thin or one-off listing can move a card's apparent price, and a cross-market gap can vanish once shipping and currency are real rather than an approximate reference rate. Open the card page to see every store's price before acting on any row here.",
  },
  {
    q: "Do I need Premium to use it?",
    a: "Not to start. A free account shows the top three deals in each view, updated daily. Premium unlocks every deal, the store filters and sorting. Price comparison, the card database, price movers and the deck builder are free for everyone, and free accounts add watchlists, price alerts and the portfolio.",
  },
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
  // ADSENSE REVIEW MODE: treat everyone as Premium for gating purposes while the
  // review is open, so this indexable page carries no blurred or locked rows.
  // "Content behind a paywall or login" is its own AdSense rejection reason. The
  // Premium CTA is unaffected — an ordinary upsell link is fine; a blur overlay
  // standing in place of the content is not. Restored by setting
  // NEXT_PUBLIC_ADSENSE_REVIEW_MODE=false. See docs/adsense-remediation.md § 9.
  const premium = isPremium(user) || ADSENSE_REVIEW_MODE;
  const access: ToolAccess = premium ? "full" : user ? "top3" : "none";
  const country = getCountry();
  const info = COUNTRIES[country];
  const sources = getArbSources(country);
  // storeKeys = every non-eBay source, which already includes the RiftCompare
  // Marketplace and TCGplayer (getArbSources adds both in) — so the "Worth more
  // on eBay" view prices its BUY side across every store, our own marketplace,
  // AND TCGplayer, selling on eBay.
  const storeKeys = sources.filter((s) => !s.isEbay).map((s) => s.key);
  const ebay = sources.find((s) => s.isEbay);
  // The TCGplayer flip view's BUY side is the mirror image: every store, the
  // marketplace, AND eBay — but never TCGplayer itself (it's the SELL/reference
  // side there, so buying from it to "flip" against itself would be circular).
  const tcgKey = TCGPLAYER_KEY[country];
  const tcgBuyKeys = storeKeys.filter((k) => k !== tcgKey).concat(ebay ? [ebay.key] : []);
  // Selectable sources for that same view's filter UI — everything except
  // TCGplayer itself (it's the fixed sell/reference side there, so it's never a
  // buy option in its own view).
  const tcgSources = sources.filter((s) => s.key !== tcgKey);
  // DEFAULT IS "tcg" (Underpriced vs TCGplayer) as of 2026-09-21, owner's
  // instruction — it was "flip" (Worth more on eBay). "Underpriced vs
  // TCGplayer" is the buying signal: it answers "where is this cheaper than
  // the wider US market right now", which is what a visitor arriving from the
  // homepage's Biggest savings column (now fed by the same signal — see
  // lib/top-deals.ts) is already looking at. "Worth more on eBay" is a
  // SELLING signal and is still one click away on its own tab.
  const view: "flip" | "deals" | "tcg" | "xregion" =
    searchParams.view === "deals" ? "deals" : searchParams.view === "flip" ? "flip" : searchParams.view === "xregion" ? "xregion" : "tcg";
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
                { "@type": "ListItem", position: 3, name: "Deal Finder", item: `${SITE_URL}/tools/deal-finder` },
              ],
            },
            {
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Riftbound Deal Finder — Cross-Store & eBay Deals",
              url: `${SITE_URL}/tools/deal-finder`,
              applicationCategory: "UtilitiesApplication",
              operatingSystem: "Web",
              offers: { "@type": "Offer", price: "0", priceCurrency: info.currency },
              description:
                "Find Riftbound cards underpriced vs TCGplayer's US market price, cards worth more on eBay than in stores, and the cards eBay is cheapest to buy.",
            },
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: DEAL_FAQS.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
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
      <HubIntro path="/tools/deal-finder" />
          <RegionToggle />
        </div>
      </div>

      {/* View switcher: links with aria-current, not an ARIA tablist (its children
          were never role="tab"). 2x2 below sm so the four labels can't widen the
          page: as one flex-1 row they summed to ~370px of min-content and laid
          the page out 386px wide at 320-360 (2026-09-23). Wrap, don't hide. */}
      <nav aria-label="Deal Finder views" className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1 sm:flex">
        <Link
          href="/tools/deal-finder?view=flip"
          aria-current={view === "flip" ? "page" : undefined}
          className={`flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-center text-sm font-bold sm:flex-1 ${view === "flip" ? "bg-brand-500/20 text-brand-200" : "text-slate-400 hover:text-white"}`}
        >
          Worth more on eBay
        </Link>
        <Link
          href="/tools/deal-finder"
          aria-current={view === "tcg" ? "page" : undefined}
          className={`flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-center text-sm font-bold sm:flex-1 ${view === "tcg" ? "bg-gold/20 text-gold" : "text-slate-400 hover:text-white"}`}
        >
          Underpriced vs TCGplayer
        </Link>
        <Link
          href="/tools/deal-finder?view=deals"
          aria-current={view === "deals" ? "page" : undefined}
          className={`flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-center text-sm font-bold sm:flex-1 ${view === "deals" ? "bg-sky-500/20 text-sky-200" : "text-slate-400 hover:text-white"}`}
        >
          Cheapest on eBay
        </Link>
        <Link
          href="/tools/deal-finder?view=xregion"
          aria-current={view === "xregion" ? "page" : undefined}
          className={`flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-center text-sm font-bold sm:flex-1 ${view === "xregion" ? "bg-lime-500/20 text-lime-200" : "text-slate-400 hover:text-white"}`}
        >
          Cross-region
        </Link>
      </nav>

      {view === "xregion" ? (
        await XRegionView({ country, info, page, access })
      ) : view === "tcg" ? (
        await TcgFlipView({
          country, info, sort: searchParams.sort === "margin" ? "margin" : "profit", page, buy: searchParams.buy,
          sources: tcgSources, defaultBuyKeys: tcgBuyKeys, access,
        })
      ) : view === "deals" ? (
        !ebay ? (
          <div className="card-surface grid place-items-center p-12 text-center text-sm text-slate-400">
            This view isn&apos;t available in {info.place} yet — it&apos;s eBay-based, and eBay doesn&apos;t cover this market.
          </div>
        ) : (
          await DealsView({ country, info, sort: searchParams.sort === "pct" ? "pct" : "saving", page, access })
        )
      ) : !ebay ? (
        <div className="card-surface grid place-items-center p-12 text-center text-sm text-slate-400">
          This view isn&apos;t available in {info.place} yet — it&apos;s eBay-based, and eBay doesn&apos;t cover this market.
        </div>
      ) : (
        await FlipView({
          country, info, sort: searchParams.sort === "margin" ? "margin" : "profit", page, buy: searchParams.buy,
          sources, ebayKey: ebay.key, storeKeys, access,
        })
      )}
      {/* Every buy/sell figure in these tables links out through an affiliate-
          tagged store, eBay or TCGplayer URL. */}
      <AffiliateDisclosure partner="both" className="text-center" />

      <section className="mt-10">
        <h2 className="mb-3 text-xl font-extrabold text-white">How Deal Finder works</h2>
        <div className="card-surface divide-y divide-ink-800">
          {DEAL_FAQS.map((f) => (
            <div key={f.q} className="px-5 py-4">
              <h3 className="font-bold text-white">{f.q}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Flip view (buy anywhere — every store + our own Marketplace + TCGplayer — sell eBay) ──
async function FlipView({
  country,
  info,
  sort,
  page,
  buy: buyParam,
  sources,
  ebayKey,
  storeKeys,
  access,
}: {
  country: ReturnType<typeof getCountry>;
  info: (typeof COUNTRIES)[keyof typeof COUNTRIES];
  sort: ArbSort;
  page: number;
  buy?: string;
  sources: ReturnType<typeof getArbSources>;
  ebayKey: string;
  storeKeys: string[];
  access: ToolAccess;
}) {
  // !== undefined, not a truthy check: `buy=` (the explicit "None" selection)
  // parses to the empty string, which must NOT fall back to every store — only
  // a param that's genuinely absent (first visit, no filter touched yet) should.
  const buy = buyParam !== undefined ? buyParam.split(",").map((s) => s.trim()).filter(Boolean) : storeKeys;
  const sell = [ebayKey];
  // Signed out: the query is not run at all. Free account: the DEFAULT ranking
  // (every store, biggest gap), first page, FREE_PREVIEW_ROWS rows — a free
  // account's ?buy= / ?sort= / ?page= are ignored, as the controls that set
  // them are Premium-only.
  const data =
    access === "full"
      ? await getArbitrage(country, { buy, sort, sell, page, pageSize: PAGE_SIZE })
      : access === "top3"
        ? await getArbitrage(country, { buy: storeKeys, sort: "profit", sell, page: 1, pageSize: FREE_PREVIEW_ROWS })
        : null;
  const href = (p: number) => `/tools/deal-finder?buy=${buy.join(",")}&sort=${sort}&page=${p}`;
  const sortHref = (s: ArbSort) => `/tools/deal-finder?buy=${buy.join(",")}&sort=${s}&page=1`;

  return (
    <>
      <p className="mb-2 max-w-2xl text-sm leading-relaxed text-slate-400">
        Cards that sell for more on <strong className="text-slate-200">eBay</strong> than the cheapest {info.adjective} store or{" "}
        <strong className="text-slate-200">TCGplayer</strong> charges.
        Handy if you&apos;re deciding whether to sell one. The gap is after an estimated ~{Math.round(EBAY_FEE * 100)}% eBay fee;
        postage isn&apos;t included.
      </p>

      {access === "full" && (
        <div className="card-surface mb-4 flex flex-wrap items-end justify-between gap-4 p-4">
          <ArbitrageFilters sources={sources} buy={buy} sellLabel="eBay" sort={sort} />
          <SortTabs sorts={FLIP_SORTS} active={sort} hrefFor={sortHref} />
        </div>
      )}

      {data === null ? (
        <LockedPreview />
      ) : data.items.length === 0 ? (
        <Empty>
          {buy.length === 0
            ? "Pick at least one store on the buy side to see results."
            : `No cards worth more on eBay from these sources right now in ${info.place}. Try widening the store side.`}
        </Empty>
      ) : (
        <>
          <div className="card-surface overflow-x-auto">
            <FlipTable items={data.items} country={country} info={info} />
          </div>
          {access === "full" ? (
            <Pager total={data.total} page={data.page} pageCount={data.pageCount} hrefFor={href} unit="cards" />
          ) : (
            <MorePremium more={data.total - data.items.length} unit="cards" />
          )}
        </>
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
  access,
}: {
  country: ReturnType<typeof getCountry>;
  info: (typeof COUNTRIES)[keyof typeof COUNTRIES];
  sort: DealSort;
  page: number;
  access: ToolAccess;
}) {
  const data =
    access === "full"
      ? await getEbayCheapest(country, sort, page, PAGE_SIZE)
      : access === "top3"
        ? await getEbayCheapest(country, "saving", 1, FREE_PREVIEW_ROWS)
        : null;
  const href = (p: number) => `/tools/deal-finder?view=deals&sort=${sort}&page=${p}`;
  const sortHref = (s: DealSort) => `/tools/deal-finder?view=deals&sort=${s}&page=1`;

  return (
    <>
      <p className="mb-4 max-w-2xl text-sm leading-relaxed text-slate-400">
        Cards where <strong className="text-slate-200">eBay is the cheapest place to buy</strong> — its price beats every{" "}
        {info.adjective} store we track. Grab the deal on eBay, or open the card to compare every option.
      </p>

      {access === "full" && (
        <div className="card-surface mb-4 flex flex-wrap items-center justify-end gap-4 p-4">
          <SortTabs sorts={DEAL_SORTS} active={sort} hrefFor={sortHref} />
        </div>
      )}

      {data === null ? (
        <LockedPreview />
      ) : data.items.length === 0 ? (
        <Empty>No cards are cheaper on eBay than in stores right now in {info.place}.</Empty>
      ) : (
        <>
          <div className="card-surface overflow-x-auto">
            <DealsTable items={data.items} country={country} info={info} />
          </div>
          {access === "full" ? (
            <Pager total={data.total} page={data.page} pageCount={data.pageCount} hrefFor={href} unit="deals" />
          ) : (
            <MorePremium more={data.total - data.items.length} unit="deals" />
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
            eBay / store are the cheapest current in-stock prices. eBay postage isn&apos;t included; thin or one-off listings
            can mislead — open the card to see every option before buying.
          </p>
        </>
      )}
    </>
  );
}

// ── Cross-region view (same card, meaningfully cheaper in another tracked market) ──
// Deliberately informational, not a flip — see getCrossRegionGaps's own header
// comment. No sort/filter UI (unlike the other three views): there's exactly
// one ranking that makes sense here (biggest gap first), and no buy/sell source
// selection since this compares MARKETS, not stores within one market.
async function XRegionView({
  country,
  info,
  page,
  access,
}: {
  country: ReturnType<typeof getCountry>;
  info: (typeof COUNTRIES)[keyof typeof COUNTRIES];
  page: number;
  access: ToolAccess;
}) {
  const data =
    access === "full"
      ? await getCrossRegionGaps(country, page, PAGE_SIZE)
      : access === "top3"
        ? await getCrossRegionGaps(country, 1, FREE_PREVIEW_ROWS)
        : null;
  const href = (p: number) => `/tools/deal-finder?view=xregion&page=${p}`;

  return (
    <>
      <p className="mb-2 max-w-2xl text-sm leading-relaxed text-slate-400">
        Cards priced meaningfully cheaper in <strong className="text-slate-200">another tracked market</strong> than in{" "}
        {info.place} — a live per-region price comparison, not a buy/sell flip.
      </p>
      <p className="mb-4 text-xs text-slate-500">
        This doesn&apos;t account for international shipping, customs, or whether the other market&apos;s stores will
        ship overseas at all — check before you buy. Currency conversion is an approximate reference rate, not a live
        FX quote.
      </p>

      {data === null ? (
        <LockedPreview />
      ) : data.items.length === 0 ? (
        <Empty>No card is meaningfully cheaper in another tracked market right now.</Empty>
      ) : (
        <>
          <div className="card-surface overflow-x-auto">
            <XRegionTable items={data.items} info={info} />
          </div>
          {access === "full" ? (
            <Pager total={data.total} page={data.page} pageCount={data.pageCount} hrefFor={href} unit="cards" />
          ) : (
            <MorePremium more={data.total - data.items.length} unit="cards" />
          )}
        </>
      )}
    </>
  );
}

// ── TCGplayer flip view (buy store → sell benchmark = TCGplayer US market price) ──
// A second flip benchmark alongside eBay: TCGplayer's own market price (converted to
// the local currency) instead of the cheapest current eBay listing. Available in
// every market — including ones with no eBay coverage — since it isn't
// eBay-based at all.
async function TcgFlipView({
  country,
  info,
  sort,
  page,
  buy: buyParam,
  sources,
  defaultBuyKeys,
  access,
}: {
  country: ReturnType<typeof getCountry>;
  info: (typeof COUNTRIES)[keyof typeof COUNTRIES];
  sort: ArbSort;
  page: number;
  buy?: string;
  sources: ReturnType<typeof getArbSources>;
  defaultBuyKeys: string[];
  access: ToolAccess;
}) {
  // Same !== undefined distinction as the flip view above — an explicit empty
  // selection must stay empty, not silently revert to the default store list.
  const buy = buyParam !== undefined ? buyParam.split(",").map((s) => s.trim()).filter(Boolean) : defaultBuyKeys;
  const data =
    access === "full"
      ? await getArbitrageVsTcgplayer(country, { buy, sort, page, pageSize: PAGE_SIZE })
      : access === "top3"
        ? await getArbitrageVsTcgplayer(country, { buy: defaultBuyKeys, sort: "profit", page: 1, pageSize: FREE_PREVIEW_ROWS })
        : null;
  const href = (p: number) => `/tools/deal-finder?view=tcg&buy=${buy.join(",")}&sort=${sort}&page=${p}`;
  const sortHref = (s: ArbSort) => `/tools/deal-finder?view=tcg&buy=${buy.join(",")}&sort=${s}&page=1`;

  return (
    <>
      <p className="mb-2 max-w-2xl text-sm leading-relaxed text-slate-400">
        Cards a {info.adjective} store or <strong className="text-slate-200">eBay</strong> is selling for less than{" "}
        <strong className="text-slate-200">TCGplayer&apos;s</strong> own
        US market price (converted to {info.currency}) — i.e. underpriced relative to the wider US market. TCGplayer only
        tracks one market price per card, so this is a reference gap, not a fee-adjusted resale estimate — shipping a card
        there means a genuine US-bound sale. eBay&apos;s side of the comparison includes its real quoted shipping cost
        (stores&apos; postage is usually unknown until checkout, so those stay item-price-only).
      </p>
      <p className="mb-4 text-xs text-slate-500">
        Currency conversion is an approximate reference rate, not a live FX quote — see the card page for the real,
        in-market prices we track.
      </p>

      {access === "full" && (
        <div className="card-surface mb-4 flex flex-wrap items-end justify-between gap-4 p-4">
          <ArbitrageFilters sources={sources} buy={buy} sellLabel="TCGplayer" sort={sort} view="tcg" />
          <SortTabs sorts={FLIP_SORTS} active={sort} hrefFor={sortHref} />
        </div>
      )}

      {data === null ? (
        <LockedPreview />
      ) : data.items.length === 0 ? (
        <Empty>
          {buy.length === 0
            ? "Pick at least one store on the buy side to see results."
            : `No cards look underpriced vs TCGplayer from these stores right now in ${info.place}.`}
        </Empty>
      ) : (
        <>
          <div className="card-surface overflow-x-auto">
            <FlipTable items={data.items} country={country} info={info} />
          </div>
          {access === "full" ? (
            <Pager total={data.total} page={data.page} pageCount={data.pageCount} hrefFor={href} unit="cards" />
          ) : (
            <MorePremium more={data.total - data.items.length} unit="cards" />
          )}
        </>
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

function XRegionTable({ items, info }: { items: Awaited<ReturnType<typeof getCrossRegionGaps>>["items"]; info: (typeof COUNTRIES)[keyof typeof COUNTRIES] }) {
  return (
    <table className="w-full min-w-[640px] text-sm">
      <thead>
        <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
          <th className="px-4 py-2.5 font-semibold">Card</th>
          <th className="px-2 py-2.5 text-right font-semibold">{info.label}</th>
          <th className="px-2 py-2.5 text-right font-semibold">Cheaper market</th>
          <th className="px-4 py-2.5 text-right font-semibold">Gap</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-ink-800">
        {items.map((it) => (
          <tr key={it.card.id} className="hover:bg-ink-800">
            <CardCell card={it.card} />
            <td className="num px-2 py-2 text-right text-slate-300">{formatMoney(it.homeCents, it.homeCurrency)}</td>
            <td className="px-2 py-2 text-right">
              <div className="num font-semibold text-lime-300">{formatMoney(it.awayCentsNative, it.awayCurrency)}</div>
              <div className="text-[10px] text-slate-500">
                {COUNTRIES[it.awayCountry].label} · ≈{formatMoney(it.awayCentsConverted, it.homeCurrency)}
              </div>
            </td>
            <td className="px-4 py-2 text-right">
              <span className="num font-bold text-lime-300">-{it.gapPct}%</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────────
// SIGNED OUT: placeholder bars where the rows would be, and the ask — a free
// account, which shows the top three. NOTHING REAL IS RENDERED: this takes no
// props at all, which is the point. Its ancestor (LockedTable) took the real
// table as a child and blurred every row but the first in CSS, so the "locked"
// rows were in the server HTML for anyone who looked.
//
// The bars are decorative and aria-hidden; a screen reader gets the heading and
// the CTA, which is the whole of the real content here. `src=tool_preview`
// attributes the sign-up (lib/signup-source-shared.ts), and the login page's
// context line for this path repeats the promise.
function LockedPreview() {
  return (
    <div className="card-surface relative overflow-hidden">
      <ul className="divide-y divide-ink-800" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="flex items-center gap-2.5 px-4 py-3 opacity-40">
            <div className="h-10 w-7 shrink-0 rounded-sm bg-ink-800" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 w-2/5 rounded bg-ink-800" />
              <div className="h-2 w-1/4 rounded bg-ink-800" />
            </div>
            <div className="h-3 w-12 rounded bg-ink-800" />
          </li>
        ))}
      </ul>
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-ink-900/60 via-ink-900/80 to-ink-900/95 p-5">
        <div className="mx-auto max-w-sm rounded-lg border border-ink-700 bg-ink-900/95 p-5 text-center">
          <h2 className="text-base font-extrabold text-white">See today&apos;s top 3 deals, free</h2>
          <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-400">
            A free account shows the three biggest deals in every view, updated daily. Premium unlocks every deal,
            with filters and sorting.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Link href="/login?next=/tools/deal-finder&src=tool_preview" className="btn-primary text-sm">
              Create a free account
            </Link>
            <PremiumNavLink surface="gate:deal-finder" className="btn-ghost text-sm">
              See Premium
            </PremiumNavLink>
          </div>
        </div>
      </div>
    </div>
  );
}

// SIGNED-IN FREE ACCOUNT, under its three real rows: how many more there are,
// and the one button that unlocks them. Takes a COUNT, never rows — the rows it
// stands in for were never fetched (see FREE_PREVIEW_ROWS). Renders nothing
// when the view has no more than the three already shown.
function MorePremium({ more, unit }: { more: number; unit: string }) {
  if (more <= 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/30 bg-gold/5 px-4 py-3">
      <p className="text-sm text-slate-300">
        <strong className="text-white">
          {more.toLocaleString()} more {unit}
        </strong>{" "}
        in this view — Premium shows every one, with store filters and sorting.
      </p>
      <PremiumButton surface="gate:deal-finder" />
    </div>
  );
}
function CardCell({ card }: { card: CardTileData }) {
  return (
    <td className="px-4 py-2">
      <CardQuickLink card={card} className="flex items-center gap-2.5">
        {card.imageThumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.imageThumbUrl} alt={cardImageAlt(card)} width={28} height={39} loading="lazy" decoding="async" className="h-10 w-7 shrink-0 rounded-sm object-cover" />
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
