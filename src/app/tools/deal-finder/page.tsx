import type { Metadata } from "next";
import { HubIntro } from "@/components/HubIntro";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForTool } from "@/lib/content/tool-guides";
import Link from "next/link";
import {
  getArbitrageVsTcgplayer,
  getCheapestOnEbayPage,
  getUnderpricedVsEbay,
  getPricesAsOf,
  dealFinderSources,
  defaultTcgBuyKeys,
  type ArbItem,
  type ArbSort,
  type VsEbayItem,
} from "@/lib/arbitrage";
import {
  DEAL_FINDER_PATH,
  hrefFor,
  parseDealFinderParams,
  type DealFinderParams,
  type DealFinderSearchParams,
  type DealFinderView,
  type MineFilter,
} from "@/lib/deal-finder-href";
import { readUserCardIds, PLUS_GATE_LINE, USER_CARD_ID_CAPS } from "@/lib/premium-nudge";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { USD_TO } from "@/lib/fx";
import { OutboundLink } from "@/components/OutboundLink";
import { AffiliateDisclosure, PaidLinkTag } from "@/components/AffiliateDisclosure";
import { EbayBuyCta } from "@/components/EbayBuyCta";
import { CheapestOnEbay } from "@/components/CheapestOnEbay";
import { cheapestEbayDeal } from "@/lib/top-deals";
import { PremiumButton } from "@/components/PremiumButton";
import { RegionToggle } from "@/components/RegionToggle";
import { ArbitrageFilters } from "@/components/ArbitrageFilters";
import { CardQuickLink } from "@/components/CardQuickLink";
import type { CardTileData } from "@/components/CardTile";
import { SITE_URL } from "@/lib/site";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense";
import { cardImageAlt } from "@/lib/image-alt";
import { cardHref } from "@/lib/card-url";
import { pageAlternates } from "@/lib/seo";
import { cardThumbProps } from "@/lib/card-image-url";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Riftbound Deal Finder — Underpriced vs TCGplayer & eBay | RiftCompare" },
  description:
    "Riftbound cards a store or eBay seller in your market is selling for less than TCGplayer's US market price, the cards whose cheapest copy is on eBay, and the cards a store sells for less than eBay. Updated daily, with direct links. Cheapest on eBay is free; free accounts see the top three of the others, Plus every one.",
  alternates: pageAlternates("/tools/deal-finder"),
  openGraph: { title: "Riftbound Deal Finder — Underpriced vs TCGplayer & eBay", url: `${SITE_URL}/tools/deal-finder` },
};

// THREE VIEWS (2026-09-30, DECISIONS.md "Deal Finder: three views"). Owner: "Can
// we just rename it underpriced versus TCG player? And get rid of the other ones
// [the Buy-from presets] … Then there should be a cheapest on eBay column. And
// then there should be an underpriced versus eBay column." Tabs directly under
// the intro, links not client state (?view=, lib/deal-finder-href.ts):
//
//   tcg      "Underpriced vs TCGplayer" (default) — the one buyer list of
//            2026-09-25: store picker, sort, paging, "Only my cards". The
//            Buy-from preset chips are gone; the picker offers every store, only
//            some, or eBay alone.
//   ebay     "Cheapest on eBay" — the whole ranking lib/arbitrage.ts
//            rankCheapestOnEbay computes, paged. FREE for everyone, signed out
//            included: every row is an eBay affiliate link to the cheapest copy
//            we track. (It was an 8-row block under the list earlier on 09-30.)
//   vs-ebay  "Underpriced vs eBay" — the mirror: a store we track sells for less
//            than the cheapest eBay listing. Gated exactly like tcg.
//
// Retired ?view= values still resolve: ?view=deals (the old Cheapest on eBay
// tab, then the eBay-only preset) opens the ebay view again; ?view=flip and
// ?view=xregion open the default. Cross-market gaps live on the free
// /market/records board, linked below the lists.
//
// Every link on the page is built by hrefFor() from ONE parsed parameter set —
// the view tabs, the pager, the sort tabs, the store picker and the "Only my
// cards" chips — so no control can drop a parameter again (the flip tab lost
// view=flip that way and sent paying members to another tab for days).
const PAGE_SIZE = 25;
// THREE LEVELS OF ACCESS (2026-09-23; DECISIONS.md, "Premium after sign-up"),
// for the two gated views (tcg, vs-ebay). The ebay view is free for everyone.
//
//   full — Plus/Premium (and ADSENSE_REVIEW_MODE): every row, the filters,
//          every page. "Only my cards" additionally needs a REAL membership
//          (isPremium(user)) — review mode has no account to read cards from.
//   top3 — a signed-in FREE account: the first FREE_PREVIEW_ROWS rows of the
//          DEFAULT ranking, and a count of how many more Plus shows.
//          Owner, 2026-09-23: "even if free accounts get to see the top 3".
//   none — signed out: NO QUERY AT ALL, and <LockedPreview /> asks for a free
//          account ("see the top 3 free").
//
// The top 3 is limited in the QUERY (pageSize: FREE_PREVIEW_ROWS), never in
// CSS. The pre-2026-09-22 teaser fetched six rows and blurred five, so the
// "locked" rows sat in the server HTML for anyone who opened devtools; nothing
// beyond the three rows a free account is entitled to may reach the page. The
// ranking aggregates are day-cached (lib/arbitrage.ts cachedOrDirect), so a
// free view costs one cached read plus a three-card detail lookup. The prose
// around the table stays: it is what the page is about, and what keeps an
// indexable page from being thin (docs/adsense-remediation.md § 9).
const FREE_PREVIEW_ROWS = 3;
type ToolAccess = "full" | "top3" | "none";

const VIEWS: { key: DealFinderView; label: string }[] = [
  { key: "tcg", label: "Underpriced vs TCGplayer" },
  { key: "ebay", label: "Cheapest on eBay" },
  { key: "vs-ebay", label: "Underpriced vs eBay" },
];

const SORTS: { key: ArbSort; label: string }[] = [
  { key: "saving", label: "Most below market" },
  { key: "pct", label: "Biggest % below" },
];

const VS_EBAY_SORTS: { key: ArbSort; label: string }[] = [
  { key: "saving", label: "Most below eBay" },
  { key: "pct", label: "Biggest % below" },
];

const MINE_CHIPS: { key: MineFilter | null; label: string }[] = [
  { key: null, label: "All cards" },
  { key: "watch", label: "My watchlist" },
  { key: "own", label: "My binder" },
];

// Markets whose eBay rows refresh on a three-day rotation rather than daily —
// lib/price-import.ts EBAY_ROTATING_MARKETS (UK → SG → EU), not imported here
// because that module's graph is the whole importer.
const EBAY_EVERY_THIRD_DAY: ReadonlySet<Country> = new Set<Country>(["UK", "SG", "EU"]);

// Explains the lists in plain words, and — the reason it was added on
// 2026-09-22 — keeps this page from going thin when its tables are gated. Every
// answer here is a fact stated elsewhere in this file or in lib/arbitrage.ts,
// written out for a reader rather than inferred from a table. Rendered visibly
// AND as FAQPage JSON-LD from the same array, the way /tools/rising does it,
// so the two can never drift apart.
const DEAL_FAQS = [
  {
    q: "What does Deal Finder compare?",
    a: "Three things, one per tab. Underpriced vs TCGplayer sets the cheapest in-stock price we track for each card in your market, at a store or on eBay, against TCGplayer's US market price converted into your currency; a card is listed when it sits at least one whole unit of your currency below it, and in the United States it must also be cheaper than TCGplayer's own cheapest listing. Cheapest on eBay lists the cards whose cheapest eBay listing costs less than every store we track. Underpriced vs eBay is the reverse: cards a store sells for less than the cheapest eBay listing. Each list is ranked by how far below the other price it sits.",
  },
  // Twice a day, not "daily" (2026-09-26): refresh-prices.yml reads store
  // prices at 07:00 and 19:00 UTC; eBay follows lib/price-import.ts's
  // EBAY_ALWAYS_MARKETS (AU, US: daily) and EBAY_ROTATING_MARKETS.
  {
    q: "How often do the numbers update?",
    a: "Store prices are read twice a day, at 07:00 and 19:00 UTC, and every figure here comes from the same prices the rest of the site runs on; the line above each list says when this market's prices were last read. eBay listings are refreshed daily in Australia and the US, and every third day in the UK, Singapore and the EU, so an eBay row there can be up to three days old.",
  },
  {
    q: "Does the price include postage?",
    a: "Store prices are the item price only, because most shops quote postage at checkout and we never guess it. eBay rows include the postage the seller states and are marked delivered. When a seller states none, the row reads eBay + postage and, like a store's price, is compared and ranked on the item price alone, so the real cost is higher than the figure shown; a listing with stated postage is shown instead whenever its delivered price is no higher. On Underpriced vs eBay that means the real gap is smaller than shown by the store's own postage. In Canada the eBay rows are US listings with international postage on top, so they are left out of the default list and there is no eBay comparison at all.",
  },
  {
    q: "Is a big gap always a good deal?",
    a: "No. TCGplayer's market price is a reference built from recent US sales, not a price you can check out at, and outside the US the gap also moves with the exchange rate shown above the list. An eBay price is one seller's asking price, not what the card sells for. A thin or one-off listing can make a card look cheap, and the cheap copy is often one seller's only one. Open the card to see every store's price before acting on any row here.",
  },
  {
    q: "Do I need to pay to use it?",
    a: "Not to start. Cheapest on eBay is free for everyone, no account needed. For the other two lists a free account shows the top three cards, updated daily; Plus shows every one, with the store filter, sorting and a filter for just the cards you watch or own, takes the ads off every page, and can email you when a watched card hits your price. Price comparison, the card database, price movers and the deck builder are free for everyone.",
  },
];

export default async function DealFinderPage({ searchParams }: { searchParams: DealFinderSearchParams }) {
  const user = await getCurrentUser();
  const member = isPremium(user);
  // ADSENSE REVIEW MODE: treat everyone as a member for gating purposes while
  // the review is open, so this indexable page carries no locked rows. "Content
  // behind a paywall or login" is its own AdSense rejection reason. Restored by
  // setting NEXT_PUBLIC_ADSENSE_REVIEW_MODE=false. See docs/adsense-remediation.md § 9.
  const premium = member || ADSENSE_REVIEW_MODE;
  const access: ToolAccess = premium ? "full" : user ? "top3" : "none";
  const country = getCountry();
  const info = COUNTRIES[country];
  // The picker's sources: every store and eBay, never TCGplayer (the reference
  // side). defaultTcgBuyKeys is the same default the homepage column and the
  // personal nudge rank with.
  const sources = dealFinderSources(country);
  const ebay = sources.find((s) => s.isEbay) ?? null;
  const tcgBuyKeys = defaultTcgBuyKeys(country);
  // ?mine= is honoured only for a real Plus+ member; anyone else's is ignored.
  // The parser also drops what the view does not use (no mine on "ebay", no
  // buy off "tcg").
  const params = parseDealFinderParams(searchParams, { allowMine: member });
  const { view, sort, page, mine } = params;
  const buy = params.buy ?? tcgBuyKeys;

  // "Only my cards": the member's own watched or binder card ids — one
  // user-scoped, capped select per request (newest first), never cached and
  // never wrapped in another cache (src/lib/db.ts rule 6). The list is filtered
  // in memory before paging (onlyCardIds in both gated loaders). `capped`
  // means the cap cut a longer list, and the copy says so.
  const mineRead =
    mine && user ? await readUserCardIds(user.id, mine).catch(() => ({ ids: new Set<string>(), capped: false })) : null;
  const onlyCardIds = mineRead?.ids;
  const mineCapped = !!mineRead?.capped;

  // Signed out runs nothing on the gated views, this included; the free eBay
  // view reads it for everyone (one day-cached aggregate row).
  const asOfPromise = view !== "ebay" && access === "none" ? Promise.resolve(null) : getPricesAsOf(country);
  // Each view queries only its own list. Every loader is self-cached through
  // its day-keyed inputs (lib/arbitrage.ts); never wrap one in a cache.
  const data =
    view !== "tcg"
      ? null
      : access === "full"
        ? await getArbitrageVsTcgplayer(country, { buy, sort, page, pageSize: PAGE_SIZE, onlyCardIds })
        : access === "top3"
          ? await getArbitrageVsTcgplayer(country, { buy: tcgBuyKeys, sort: "saving", page: 1, pageSize: FREE_PREVIEW_ROWS })
          : null;
  const vsEbay =
    view !== "vs-ebay"
      ? null
      : access === "full"
        ? await getUnderpricedVsEbay(country, { sort, page, pageSize: PAGE_SIZE, onlyCardIds })
        : access === "top3"
          ? await getUnderpricedVsEbay(country, { sort: "saving", page: 1, pageSize: FREE_PREVIEW_ROWS })
          : null;
  // Free for everyone: no access split, the same page for every visitor.
  const cheapestEbay = view === "ebay" ? await getCheapestOnEbayPage(country, page, PAGE_SIZE) : null;
  const asOf = await asOfPromise;

  const priceLine = (
    <p className="mb-4 text-xs text-slate-500">
      {asOf ? <>Prices as of {formatAsOf(asOf)}. </> : null}
      {view === "tcg" && country !== "US" ? (
        <>
          Converted at US$1 = {formatMoney(Math.round((USD_TO[info.currency] ?? 1) * 100), info.currency)}, an approximate
          reference rate. </>
      ) : null}
      {ebay && EBAY_EVERY_THIRD_DAY.has(country) ? <>eBay listings in {info.place} refresh every third day.</> : null}
    </p>
  );
  const mineChips = member ? (
    <MineChips params={params} mine={mine} count={onlyCardIds?.size ?? null} capped={mineCapped} />
  ) : null;

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
            // No `offers` here (2026-09-25): a "price": "0" Offer told search
            // engines the full list is free, and it is a Plus feature.
            {
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Riftbound Deal Finder",
              url: `${SITE_URL}/tools/deal-finder`,
              applicationCategory: "UtilitiesApplication",
              operatingSystem: "Web",
              description:
                "Riftbound cards underpriced against TCGplayer's US market price or against eBay in the buyer's market, and the cards whose cheapest copy is an eBay listing, in the buyer's currency.",
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
          <RegionToggle />
        </div>
        {/* Under the heading row, not inside it (2026-09-26): as a flex item
            beside the h1 it pushed the market toggle below the whole intro.
            Above the access split, so signed-out visitors and crawlers get it. */}
        <HubIntro path="/tools/deal-finder" />
      </div>

      <ViewTabs params={params} />

      {view === "tcg" && (
        <section aria-labelledby="df-tcg">
          <h2 id="df-tcg" className="mb-1 text-lg font-extrabold text-white">Underpriced vs TCGplayer</h2>
          <p className="mb-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            Cards a {info.adjective} store or <strong className="text-slate-200">eBay</strong> seller is selling for less than{" "}
            <strong className="text-slate-200">TCGplayer&apos;s</strong> US market price
            {country === "US" ? "" : ` (converted to ${info.currency})`}. Store prices are the item price — postage is added at
            checkout. eBay prices include the seller&apos;s stated postage where there is one.
          </p>
          {priceLine}
          {mineChips}

          {access === "full" && (
            <div className="card-surface mb-4 flex flex-wrap items-end justify-between gap-4 p-4">
              <ArbitrageFilters sources={sources} buy={buy} defaultBuy={tcgBuyKeys} params={params} />
              <SortTabs sorts={SORTS} active={sort} linkFor={(s) => hrefFor(params, { sort: s, page: 1 })} />
            </div>
          )}

          {data === null ? (
            <>
              <LockedPreview />
              {/* SIGNED OUT (2026-09-26, "Pushing eBay clicks" in DECISIONS.md): the
                  list is locked, but shopping is not. A visitor who came to find
                  cheap cards and does not want an account still gets somewhere to
                  buy — eBay's Riftbound singles search, an affiliate click. Beside
                  the lock, never inside LockedPreview, which stays prop-less and
                  renders nothing real. EbayBuyCta carries its own disclosure. */}
              <EbayBuyCta source="deal-finder-locked" pageType="deals" className="mt-4" />
            </>
          ) : data.items.length === 0 ? (
            <Empty>
              <EmptyMessage params={params} buy={buy} place={info.place} mineCount={onlyCardIds?.size ?? null} mineCapped={mineCapped} />
            </Empty>
          ) : (
            <>
              <div className="card-surface overflow-x-auto">
                <BuyerTable items={data.items} country={country} currency={info.currency} />
              </div>
              {access === "full" ? (
                <Pager total={data.total} page={data.page} pageCount={data.pageCount} linkFor={(p) => hrefFor(params, { page: p })} unit="cards" />
              ) : (
                <MorePremium more={data.total - data.items.length} unit="cards" />
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
                Best price is the cheapest in-stock copy we track: a store&apos;s item price (postage extra), or an eBay listing —
                &ldquo;delivered&rdquo; includes the seller&apos;s stated postage, &ldquo;+ postage&rdquo; means none was stated.
                TCGplayer market is a reference from recent US sales, not a price you can check out at. Thin or one-off listings
                can mislead — open the card to see every store before buying.
              </p>
            </>
          )}
        </section>
      )}

      {view === "ebay" && cheapestEbay && (
        <section aria-labelledby="df-ebay">
          <h2 id="df-ebay" className="mb-1 text-lg font-extrabold text-white">Cheapest on eBay</h2>
          <p className="mb-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            Cards whose cheapest <strong className="text-slate-200">eBay</strong> listing in {info.place} costs less than every
            store we track there{country === "US" ? " and TCGplayer's own cheapest listing" : country === "EU" ? " and CardTrader" : ""},
            ranked by how much less. Free for everyone. The eBay price includes the seller&apos;s stated postage where there is one;
            store prices it beats are item prices, postage extra.
          </p>
          {priceLine}
          {!cheapestEbay.available ? (
            <Empty>
              <NoEbayComparison place={info.place} country={country} />
            </Empty>
          ) : cheapestEbay.items.length === 0 ? (
            <Empty>
              No card&apos;s cheapest eBay listing beats every store we track in {info.place} right now.
            </Empty>
          ) : (
            <>
              <CheapestOnEbay
                rows={cheapestEbay.items.map((it) => cheapestEbayDeal(it, DEAL_FINDER_PATH))}
                currency={info.currency}
                country={country}
                pageType="deals"
                bare
                positionOffset={(cheapestEbay.page - 1) * PAGE_SIZE}
                className=""
              />
              <Pager
                total={cheapestEbay.total}
                page={cheapestEbay.page}
                pageCount={cheapestEbay.pageCount}
                linkFor={(p) => hrefFor(params, { page: p })}
                unit="cards"
              />
            </>
          )}
        </section>
      )}

      {view === "vs-ebay" && (
        <section aria-labelledby="df-vs-ebay">
          <h2 id="df-vs-ebay" className="mb-1 text-lg font-extrabold text-white">Underpriced vs eBay</h2>
          <p className="mb-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            Cards a {info.adjective} store{country === "EU" ? " or CardTrader" : ""} sells for less than the cheapest{" "}
            <strong className="text-slate-200">eBay</strong> listing in {info.place}. An eBay listing is one seller&apos;s asking
            price, not a sale. Store prices are the item price — postage is added at checkout, so the real gap is smaller by the
            store&apos;s postage.
          </p>
          {priceLine}
          {mineChips}

          {access === "full" && vsEbay?.available && (
            <div className="card-surface mb-4 flex flex-wrap items-end justify-end gap-4 p-4">
              <SortTabs sorts={VS_EBAY_SORTS} active={sort} linkFor={(s) => hrefFor(params, { sort: s, page: 1 })} />
            </div>
          )}

          {vsEbay === null ? (
            <>
              <LockedPreview />
              <EbayBuyCta source="deal-finder-locked" pageType="deals" className="mt-4" />
            </>
          ) : !vsEbay.available ? (
            <Empty>
              <NoEbayComparison place={info.place} country={country} />
            </Empty>
          ) : vsEbay.items.length === 0 ? (
            <Empty>
              {params.mine && onlyCardIds ? (
                <>None of the cards you picked is below eBay at a store right now.</>
              ) : (
                <>No store we track in {info.place} sells a card for less than its cheapest eBay listing right now.</>
              )}
            </Empty>
          ) : (
            <>
              <div className="card-surface overflow-x-auto">
                <VsEbayTable items={vsEbay.items} country={country} currency={info.currency} />
              </div>
              {access === "full" ? (
                <Pager total={vsEbay.total} page={vsEbay.page} pageCount={vsEbay.pageCount} linkFor={(p) => hrefFor(params, { page: p })} unit="cards" />
              ) : (
                <MorePremium more={vsEbay.total - vsEbay.items.length} unit="cards" />
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
                Best store price is the cheapest in-stock copy at a store we track, item price only (postage extra). Cheapest on
                eBay is the cheapest in-stock listing&apos;s asking price — &ldquo;delivered&rdquo; includes the seller&apos;s
                stated postage, &ldquo;+ postage&rdquo; means none was stated. Below eBay is measured on these two figures, and %
                below is a share of the eBay price. Open the card to see every store before buying.
              </p>
            </>
          )}
        </section>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Looking for cards that cost less in another market?{" "}
        {/* ?market= is this page's market: /market/records reads its market
            from the URL (default US), not from the country cookie this page
            uses, so a bare link sent every non-US reader to the US board. */}
        <Link href={`/market/records?market=${country}#gaps`} className="text-brand-400 hover:underline">
          The cross-market board
        </Link>{" "}
        ranks the biggest price gaps between the markets we track, free.
      </p>
      {/* Every price in the tables links out through an affiliate-tagged store,
          eBay or TCGplayer URL. */}
      <AffiliateDisclosure partner="both" className="text-center" />

      {/* The guides behind the list, after it and outside the access split, so
          a signed-out visitor gets them too (lib/content/tool-guides.ts). */}
      <RelatedGuides guides={guidesForTool("/tools/deal-finder")} className="card-surface mt-8 p-5" />

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

// ── The view tabs ────────────────────────────────────────────────────────────
// Links, not client state: each view is its own URL (hrefFor with view + page
// 1, keeping the parameters that view uses), so Back works, a view can be
// shared, and the server renders only the list that is showing. One row of
// three equal segments at every width — at 390px a label wraps onto a second
// line inside its segment rather than the row wrapping into a ragged stack.
// The active segment wears the site's brand-green fill (the pill rows'
// active state); `aria-current="page"` names it for assistive tech.
function ViewTabs({ params }: { params: DealFinderParams }) {
  return (
    <nav aria-label="Deal Finder views" className="mb-5 grid grid-cols-3 gap-1 rounded-xl border border-ink-800 bg-ink-900 p-1">
      {VIEWS.map((v) => {
        const active = params.view === v.key;
        return (
          <Link
            key={v.key}
            href={hrefFor(params, { view: v.key, page: 1 })}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-lg px-2 py-1.5 text-center text-xs font-bold leading-tight sm:text-sm ${active ? "bg-brand-500 text-ink-950" : "text-slate-400 hover:bg-ink-800 hover:text-white"}`}
          >
            {v.label}
          </Link>
        );
      })}
    </nav>
  );
}

// "Only my cards" (Plus): on the two gated views. Every link through hrefFor.
function MineChips({ params, mine, count, capped }: { params: DealFinderParams; mine: MineFilter | null; count: number | null; capped: boolean }) {
  return (
    <nav aria-label="Which cards" className="mb-3 flex flex-wrap items-center gap-1.5">
      {MINE_CHIPS.map((c) => {
        const active = mine === c.key;
        return (
          <Link
            key={c.label}
            href={hrefFor(params, { mine: c.key, page: 1 })}
            aria-current={active ? "true" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-semibold ${active ? "bg-brand-500 text-ink-950" : "bg-ink-900 text-slate-400 hover:bg-ink-800 hover:text-white"}`}
          >
            {c.label}
            {active && c.key && count != null ? <span className="num ml-1.5 opacity-70">{count}</span> : null}
          </Link>
        );
      })}
      {mine && capped ? (
        <span className="text-xs text-slate-500">
          Checking your {USER_CARD_ID_CAPS[mine].toLocaleString("en-US")} most recent{" "}
          {mine === "watch" ? "watches" : "binder entries"}.
        </span>
      ) : null}
    </nav>
  );
}

// Canada (or a market with no eBay feed): say why there is no eBay list at all,
// rather than "nothing today", which would imply there sometimes is.
function NoEbayComparison({ place, country }: { place: string; country: Country }) {
  if (country === "CA") {
    return (
      <>
        There is no eBay comparison for Canada. The eBay listings we track for Canadian buyers are US listings with
        international postage on top that no seller has quoted, so we can&apos;t honestly say one costs more or less than a
        Canadian store.
      </>
    );
  }
  return <>We don&apos;t track eBay listings in {place} yet, so there is nothing to compare against.</>;
}

function formatAsOf(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(iso));
}

// ── The list ─────────────────────────────────────────────────────────────────
// Buyer columns only (2026-09-25): Best price · TCGplayer market · Below market
// · % below. It used to reuse the eBay-resale table, so a buyer read "Sell",
// a green "+ Net profit" and a "Margin" measured over the BUY price — which
// disagreed with the homepage's "Save X%" for the same card. "% below" is
// belowTcgPct, the one definition the homepage badge uses too.
//
// Below sm it is three columns — Card · Best price · Below market, with the %
// folded under the amount — instead of a 640px-wide table scrolled sideways
// inside its card, which cut Best price mid-number at 390px and hid the
// saving off-screen (QA, 2026-09-25). The TCGplayer market figure is the one
// column dropped there; Below market is measured against it.
function BuyerTable({ items, country, currency }: { items: ArbItem[]; country: Country; currency: string }) {
  return (
    <table className="w-full text-sm sm:min-w-[640px]">
      <thead>
        <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
          <th className="px-3 py-2.5 font-semibold sm:px-4">Card</th>
          <th className="px-2 py-2.5 text-right font-semibold">Best price</th>
          <th className="hidden px-2 py-2.5 text-right font-semibold sm:table-cell">TCGplayer market</th>
          <th className="px-3 py-2.5 text-right font-semibold sm:px-2">Below market</th>
          <th className="hidden px-4 py-2.5 text-right font-semibold sm:table-cell">% below</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-ink-800">
        {/* pageType + surface on both links (2026-09-26): their buy_click
            arrived with neither, so the Deal Finder's clicks — eBay rows
            included — could not be told from any other page's. */}
        {items.map((it, i) => (
          <tr key={it.card.id} className="hover:bg-ink-800">
            <CardCell card={it.card} />
            <td className="px-2 py-2 text-right">
              <OutboundLink
                href={it.buyUrl}
                retailer={it.buyStore}
                country={country}
                pageType="deals"
                surface="table"
                cardId={it.card.id}
                cardName={it.card.name}
                price={it.buyCents / 100}
                positionInList={i + 1}
                inStock
                className="num font-semibold text-white hover:text-brand-400"
              >
                {formatMoney(it.buyCents, currency)}
              </OutboundLink>
              <div className="ml-auto max-w-[5.5rem] truncate text-[10px] text-slate-500 sm:max-w-none" title={it.buyStoreName}>{it.buyStoreName}</div>
            </td>
            <td className="hidden px-2 py-2 text-right sm:table-cell">
              <OutboundLink href={it.marketUrl} retailer="tcgplayer" country={country} pageType="deals" surface="table" cardId={it.card.id} cardName={it.card.name} className="num text-slate-300 hover:text-brand-400">
                {formatMoney(it.marketCents, currency)}
              </OutboundLink>
              <div className="text-[10px] text-slate-500">
                {it.tcgLowCents != null ? `TCGplayer low ${formatMoney(it.tcgLowCents, "USD")}` : country === "US" ? "US market" : "US market, converted"}
              </div>
            </td>
            <td className="num px-3 py-2 text-right font-bold text-up sm:px-2">
              {formatMoney(it.belowCents, currency)}
              <div className="text-[10px] font-semibold sm:hidden">{it.belowPct}% below</div>
            </td>
            <td className="num hidden px-4 py-2 text-right font-semibold text-up sm:table-cell">{it.belowPct}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Underpriced vs eBay ──────────────────────────────────────────────────────
// Card · Best store price · Cheapest on eBay · Below eBay · % below. Below sm it
// is three columns, like BuyerTable: the eBay figure folds under the Below eBay
// amount ("vs eBay $X delivered") instead of a fourth column scrolled sideways.
// The store price links to that store's own listing (the live row the loader
// re-scored); the eBay price links to the listing it names, so either side can
// be checked. Both are affiliate-tagged OutboundLinks with this page's
// pageType and surface, like the default list's.
function VsEbayTable({ items, country, currency }: { items: VsEbayItem[]; country: Country; currency: string }) {
  const postage = (known: boolean) => (known ? "delivered" : "+ postage");
  return (
    <table className="w-full text-sm sm:min-w-[640px]">
      <thead>
        <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
          <th className="px-3 py-2.5 font-semibold sm:px-4">Card</th>
          <th className="px-2 py-2.5 text-right font-semibold">Best store price</th>
          <th className="hidden px-2 py-2.5 text-right font-semibold sm:table-cell">Cheapest on eBay</th>
          <th className="px-3 py-2.5 text-right font-semibold sm:px-2">Below eBay</th>
          <th className="hidden px-4 py-2.5 text-right font-semibold sm:table-cell">% below</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-ink-800">
        {items.map((it, i) => (
          <tr key={it.card.id} className="hover:bg-ink-800">
            <td className="px-3 py-2 sm:px-4">
              <Link href={cardHref(it.card)} prefetch={false} className="flex items-center gap-2.5">
                {it.card.imageThumbUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img {...cardThumbProps({ imageThumbUrl: it.card.imageThumbUrl }, "28px")} alt={cardImageAlt(it.card)} width={28} height={39} loading="lazy" decoding="async" className="h-9 w-[26px] shrink-0 rounded-sm object-cover sm:h-10 sm:w-7" />
                )}
                <span className="min-w-0 max-w-[6rem] sm:max-w-none">
                  <span className="block truncate font-semibold text-white">{it.card.name}</span>
                  <span className="block text-[11px] text-slate-500">{it.card.setCode} · {it.card.collectorNumber}</span>
                </span>
              </Link>
            </td>
            <td className="px-2 py-2 text-right">
              <OutboundLink
                href={it.storeUrl}
                retailer={it.storeKey}
                country={country}
                pageType="deals"
                surface="table"
                cardId={it.card.id}
                cardName={it.card.name}
                price={it.storeCents / 100}
                positionInList={i + 1}
                inStock
                className="num font-semibold text-white hover:text-brand-400"
              >
                {formatMoney(it.storeCents, currency)}
              </OutboundLink>
              <div className="ml-auto max-w-[5.5rem] truncate text-[10px] text-slate-500 sm:max-w-none" title={it.storeName}>{it.storeName}</div>
            </td>
            <td className="hidden px-2 py-2 text-right sm:table-cell">
              <OutboundLink href={it.ebayUrl} retailer={it.ebayKey} country={country} pageType="deals" surface="table" cardId={it.card.id} cardName={it.card.name} price={it.ebayCents / 100} inStock className="num text-slate-300 hover:text-brand-400">
                {formatMoney(it.ebayCents, currency)}
              </OutboundLink>
              <div className="text-[10px] text-slate-500">eBay {postage(it.postageKnown)}</div>
            </td>
            <td className="num px-3 py-2 text-right font-bold text-up sm:px-2">
              {formatMoney(it.belowCents, currency)}
              <div className="text-[10px] font-semibold sm:hidden">{it.belowPct}% below</div>
              <div className="text-[10px] font-normal text-slate-500 sm:hidden">
                vs eBay {formatMoney(it.ebayCents, currency)} {postage(it.postageKnown)}
              </div>
            </td>
            <td className="num hidden px-4 py-2 text-right font-semibold text-up sm:table-cell">{it.belowPct}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyMessage({
  params,
  buy,
  place,
  mineCount,
  mineCapped = false,
}: {
  params: DealFinderParams;
  buy: string[];
  place: string;
  mineCount: number | null;
  mineCapped?: boolean;
}) {
  if (buy.length === 0) return <>Pick at least one store on the buy side to see results.</>;
  // A narrowed store selection is the likeliest reason for an empty list, so
  // offer the way back to every store rather than just saying "nothing".
  const widen =
    params.buy !== null ? (
      <>
        {" "}
        <Link href={hrefFor(params, { buy: null, page: 1 })} className="text-brand-400 hover:underline">
          Try every store
        </Link>
        .
      </>
    ) : null;
  if (params.mine && mineCount != null) {
    if (mineCount === 0) {
      return params.mine === "watch" ? (
        <>You aren&apos;t watching any cards yet — tap the heart on any card to add it to your watchlist.</>
      ) : (
        <>
          Your binder is empty — add the cards you own on{" "}
          <Link href="/portfolio" className="text-brand-400 hover:underline">your portfolio</Link>.
        </>
      );
    }
    // Capped: the read stopped at the newest N rows (lib/premium-nudge.ts
    // USER_CARD_ID_CAPS), so "none of your N cards" would be false for a longer
    // list — say which ones were checked instead.
    const cap = USER_CARD_ID_CAPS[params.mine].toLocaleString("en-US");
    const line = mineCapped
      ? params.mine === "watch"
        ? `None of your ${cap} most recent watches is below TCGplayer market right now.`
        : `None of your ${cap} most recently added binder entries is below TCGplayer market right now.`
      : params.mine === "watch"
        ? mineCount === 1
          ? "Your watched card isn't below TCGplayer market right now."
          : `None of your ${mineCount} watched cards is below TCGplayer market right now.`
        : mineCount === 1
          ? "The card in your binder isn't below TCGplayer market right now."
          : `None of the ${mineCount} cards in your binder is below TCGplayer market right now.`;
    return (
      <>
        {line}
        {widen}
      </>
    );
  }
  return (
    <>
      No cards are below TCGplayer market from these sources right now in {place}.{widen}
    </>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────────
// SIGNED OUT, on either gated view (Underpriced vs TCGplayer, Underpriced vs
// eBay): placeholder bars where the rows would be, and the ask — a free
// account, which shows the top three of that list. NOTHING REAL IS RENDERED: this takes no
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
            A free account shows the top three cards on this list, updated daily. {PLUS_GATE_LINE}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Link href="/login?next=/tools/deal-finder&src=tool_preview" className="btn-primary text-sm">
              Create a free account
            </Link>
            <PremiumButton surface="gate:deal-finder" tier="plus" className="btn-ghost text-sm">
              See Plus
            </PremiumButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// SIGNED-IN FREE ACCOUNT, under its three real rows: how many more there are,
// and the one button that unlocks them — on Plus, the tier that does. Takes a
// COUNT, never rows — the rows it stands in for were never fetched (see
// FREE_PREVIEW_ROWS). Renders nothing when there are no more than the three.
function MorePremium({ more, unit }: { more: number; unit: string }) {
  if (more <= 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/30 bg-gold/5 px-4 py-3">
      <p className="text-sm text-slate-300">
        <strong className="text-white">
          {more.toLocaleString()} more {more === 1 ? unit.replace(/s$/, "") : unit}
        </strong>{" "}
        on this list. {PLUS_GATE_LINE}
      </p>
      <PremiumButton surface="gate:deal-finder" tier="plus" />
    </div>
  );
}
function CardCell({ card }: { card: CardTileData }) {
  return (
    <td className="px-3 py-2 sm:px-4">
      <CardQuickLink card={card} className="flex items-center gap-2.5">
        {card.imageThumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img {...cardThumbProps({ imageThumbUrl: card.imageThumbUrl }, "28px")} alt={cardImageAlt(card)} width={28} height={39} loading="lazy" decoding="async" className="h-9 w-[26px] shrink-0 rounded-sm object-cover sm:h-10 sm:w-7" />
        )}
        {/* Capped below sm so a long name truncates instead of widening the
            table past a phone. The thumbnail stays at every width (owner,
            2026-09-25: "the deal finder should still have some thumbnails") —
            a slightly smaller one, and a narrower name, pay for it on phones. */}
        <span className="min-w-0 max-w-[6rem] sm:max-w-none">
          <span className="block truncate font-semibold text-white">{card.name}</span>
          <span className="block text-[11px] text-slate-500">{card.setCode} · {card.collectorNumber}</span>
        </span>
      </CardQuickLink>
    </td>
  );
}

function SortTabs<T extends string>({ sorts, active, linkFor }: { sorts: { key: T; label: string }[]; active: T; linkFor: (s: T) => string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sort</div>
      <div className="mt-0.5 flex gap-1">
        {sorts.map((s) => (
          <Link
            key={s.key}
            href={linkFor(s.key)}
            aria-current={active === s.key ? "true" : undefined}
            className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold ${active === s.key ? "bg-brand-500/20 text-brand-200" : "bg-ink-900 text-slate-400 hover:text-white"}`}
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

function Pager({ total, page, pageCount, linkFor, unit }: { total: number; page: number; pageCount: number; linkFor: (p: number) => string; unit: string }) {
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-xs text-slate-500">
        {total.toLocaleString()} {total === 1 ? unit.replace(/s$/, "") : unit} · page {page} of {pageCount}
      </span>
      <div className="flex gap-2">
        {page > 1 && <Link href={linkFor(page - 1)} className="btn-ghost text-sm">← Prev</Link>}
        {page < pageCount && <Link href={linkFor(page + 1)} className="btn-ghost text-sm">Next →</Link>}
      </div>
    </div>
  );
}
