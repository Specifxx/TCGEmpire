import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CardImage } from "@/components/CardImage";
import { DomainBadge, RarityBadge, VariantBadge, OvernumberedBadge, PromoBadge, SignatureBadge } from "@/components/Badge";
import { isOvernumbered, isSignature } from "@/lib/constants";
import { WishlistButton } from "@/components/WishlistButton";
import { ShareButton } from "@/components/ShareButton";
import { CardViewBeacon } from "@/components/CardViewBeacon";
import { formatMoney } from "@/lib/format";
import { effectiveShippingCents, shippingPolicyUrl } from "@/lib/retailers";
import { affiliateUrl, ebayAffiliateUrl } from "@/lib/affiliate";
import { cardDisplayName } from "@/lib/card-name";
import { CardTile } from "@/components/CardTile";
import { cardTileSelect } from "@/lib/cards";
import { AdSlot } from "@/components/AdSlot";
import { EmbedCardButton } from "@/components/EmbedCardButton";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { setByCode } from "@/lib/constants";
import { domainSlug } from "@/lib/domains";
import { decksUsingCard } from "@/lib/meta-decks";
import { SITE_URL } from "@/lib/site";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { NetProceeds } from "@/components/NetProceeds";
import { AiInsight } from "@/components/AiInsight";
import { CardPriceMetrics, CardPriceComparison, type EbaySearchMap } from "@/components/CardMarketSection";
import { computeMarket, type MarketRow } from "@/lib/market-rows";

// REAL ISR: no cookie/header reads anywhere in this route's tree — the page is
// rendered once on the AU baseline and served from cache to every visitor and
// crawler. The market-dependent UI (metrics, store list, eBay fallback) ships ALL
// markets' rows to a client component that localises after hydration, so switching
// country never needs a server render. This is the fix for GSC's "Discovered –
// currently not indexed" backlog: Googlebot gets fast cached 200s instead of a
// full per-request render on every one of ~1,200 card URLs.
export const revalidate = 86400;

// Prewarm the most-searched cards at build so their first crawl hits the cache;
// the long tail renders on demand and is then cached by `revalidate`. The build
// sandbox has no DATABASE_URL, so degrade to on-demand-only rather than failing.
export async function generateStaticParams() {
  try {
    const cards = await prisma.card.findMany({
      orderBy: [{ searchCount: "desc" }, { viewCount: "desc" }],
      take: 200,
      select: { slug: true, id: true },
    });
    return cards.map((c) => ({ id: c.slug ?? c.id }));
  } catch {
    return [];
  }
}

// Accept either the slug ("vayne-hunter-sfd-223-221") or the legacy cuid.
const whereParam = (p: string) => ({ OR: [{ slug: p }, { id: p }] });

const fmtAud = (cents: number) => formatMoney(cents); // AUD — the cached baseline market

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const card = await prisma.card.findFirst({
    where: whereParam(params.id),
    select: {
      slug: true, name: true, setName: true, setCode: true, collectorNumber: true,
      variant: true, isPromo: true, rarity: true,
      lowestPriceCents: true,
      // Live AU in-stock retailer keys — a real number in the snippet is the CTR
      // lever this vertical runs on (competitors' snippets show "$X / N stores").
      // Rows are unique per [retailer, condition, isFoil], so count DISTINCT
      // retailers or one store's NM + foil listings would read as "2 stores".
      retailerPrices: { where: { country: "AU", inStock: true }, select: { retailer: true } },
    },
  });
  if (!card) notFound(); // real 404 — metadata resolves before streaming

  // MARKET-NEUTRAL metadata (the page is cached once for all markets). The
  // display name carries the printing credentials (Promo/Alt Art/Signature…) so
  // variant printings that share a name + number stop emitting byte-identical
  // titles — duplicate-looking clusters are exactly what Google leaves unindexed.
  const displayName = cardDisplayName(card.name, card);
  // Adaptive title: the full form busts the ~60-char SERP window for long legend
  // names and credentialed printings, so those fall back to a compact form — the
  // query phrase ("{name} Price") must survive truncation for every name length.
  // (setCode keeps same-name printings in DIFFERENT sets from sharing a title.)
  const fullTitle = `${displayName} Price — Riftbound ${card.setName} ${card.collectorNumber}`;
  const title = fullTitle.length > 52 ? `${displayName} Price — Riftbound ${card.setCode}` : fullTitle;
  const stores = new Set(card.retailerPrices.map((r) => r.retailer)).size;
  const description =
    card.lowestPriceCents != null && stores > 0
      ? `Live ${displayName} prices from ${fmtAud(card.lowestPriceCents)} across ${stores} ${stores === 1 ? "store" : "stores"} — compare AU, NZ, US & UK, with price history. Updated daily.`
      : `Compare live ${displayName} prices across AU, NZ, US & UK stores — Riftbound ${card.setName} ${card.collectorNumber}. Price history included. Updated daily.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/card/${card.slug ?? params.id}`,
      // Single cookie-switched URL is the global default for all four markets.
      languages: { "x-default": `${SITE_URL}/card/${card.slug ?? params.id}` },
      // Machine-readable markdown for AI agents (rel=alternate type=text/markdown).
      types: { "text/markdown": `${SITE_URL}/llm/card/${card.slug ?? params.id}` },
    },
    // og:image + twitter:image are provided by the co-located opengraph-image.tsx
    // (a branded price card: art + name + lowest live price).
    openGraph: {
      title,
      description,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function CardPage({ params }: { params: { id: string } }) {
  const card = await prisma.card.findFirst({
    where: whereParam(params.id),
    include: {
      // ALL markets' listings — the client market section filters to the visitor's
      // country, so a market switch is instant and never re-renders the server page.
      // Select ONLY the columns MarketRow needs: this query returns the most rows
      // (every listing × 4 markets), so trimming columns is the biggest per-render
      // egress cut on the site's highest-volume page.
      retailerPrices: {
        orderBy: { priceCents: "asc" },
        select: {
          id: true, country: true, retailer: true, retailerName: true, priceCents: true,
          shippingCents: true, condition: true, isFoil: true, inStock: true, lastSeen: true, url: true,
        },
      },
    },
  });

  if (!card) notFound();

  const displayName = cardDisplayName(card.name, card);

  // Serialize + enrich rows for the client market section. Affiliate URLs and
  // shipping-policy lookups are server-only tables, so they're resolved here once
  // rather than shipping those libs to the browser.
  const rows: MarketRow[] = card.retailerPrices.map((p) => ({
    id: p.id,
    country: p.country,
    retailer: p.retailer,
    retailerName: p.retailerName,
    priceCents: p.priceCents,
    ship: effectiveShippingCents(p.shippingCents),
    condition: p.condition,
    isFoil: p.isFoil,
    inStock: p.inStock,
    lastSeen: p.lastSeen.toISOString(),
    buyHref: affiliateUrl(p.url, p.retailer),
    policyUrl: shippingPolicyUrl(p.retailer),
  }));

  // AU baseline view — powers the cached HTML's structured data and prose (the
  // same market the SSR'd client components render before hydration).
  const au = computeMarket(rows, DEFAULT_COUNTRY);

  // eBay fallback search per market, precomputed (affiliate tagging is server-side).
  // Shown by the client section only when that market has no live eBay rows AND we
  // couldn't check eBay this cycle (quota) — NZ always qualifies (no local eBay;
  // eBay AU ships there, and a zero-listing page must never be a dead end).
  const EBAY_MKT: Record<string, { domain: string; label: string }> = {
    AU: { domain: "ebay.com.au", label: "eBay Australia" },
    NZ: { domain: "ebay.com.au", label: "eBay AU (ships to NZ)" },
    US: { domain: "ebay.com", label: "eBay" },
    UK: { domain: "ebay.co.uk", label: "eBay UK" },
  };
  const ebayUnchecked = !card.ebayCheckedAt || Date.now() - card.ebayCheckedAt.getTime() > 28 * 60 * 60 * 1000;
  const ebaySearch: EbaySearchMap = Object.fromEntries(
    Object.entries(EBAY_MKT).map(([c, mkt]) => [
      c,
      ebayUnchecked || c === "NZ"
        ? {
            url: ebayAffiliateUrl(`https://www.${mkt.domain}/sch/i.html?_nkw=${encodeURIComponent(`${card.name} Riftbound`)}`),
            label: mkt.label,
            nz: c === "NZ",
          }
        : null,
    ])
  );

  // Structured data so Google can show a rich price snippet ("$X, N stores").
  // Google requires a Product to carry "offers", "review", or "aggregateRating";
  // a Product without any of these is a critical Search Console error. So we only
  // emit the Product markup when we actually have priced, in-stock offers to back
  // it — unpriced cards simply omit it rather than emit an invalid empty Product.
  const hasOffers = au.prices.length > 0 && au.lowest != null;
  const jsonLd = hasOffers
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: displayName,
        category: "Trading Card",
        description: `${displayName} — Riftbound ${card.setName} (${card.setCode}) ${card.collectorNumber}. Compare live store prices.`,
        ...(card.imageUrl ? { image: card.imageUrl } : {}),
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "AUD",
          lowPrice: (au.lowest! / 100).toFixed(2),
          highPrice: (au.prices[au.prices.length - 1].priceCents / 100).toFixed(2),
          offerCount: au.prices.length,
          availability: "https://schema.org/InStock",
          // priceValidUntil = now + 1 day: prices refresh on the daily import, so
          // each snapshot is honest only until the next day's pass overwrites it.
          priceValidUntil: new Date(Date.now() + 86400e3).toISOString().slice(0, 10),
        },
      }
    : null;

  // Unique editorial copy + FAQ so each card page carries substantive, crawlable
  // text rather than just a price table (thin content ranks poorly). Everything
  // below is generated from this card's own attributes, so no two pages match.
  const tags = (card.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const about = buildAbout(card, au.lowest, au.storeCount);
  const faqs = buildFaqs(card, au.lowest, au.storeCount);
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  // Breadcrumbs: real internal links (Home → Cards → Set → Card) plus matching
  // structured data. This deepens internal linking — the single biggest lever for
  // getting the long-tail card pages crawled and indexed — and earns breadcrumb
  // rich results in Google.
  const setInfo = setByCode(card.setCode);
  const setUrl = setInfo && !setInfo.comingSoon ? `/sets/${setInfo.slug}` : "/browse";
  const cardUrl = `/card/${card.slug ?? params.id}`;
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Cards", item: `${SITE_URL}/browse` },
      { "@type": "ListItem", position: 3, name: card.setName, item: `${SITE_URL}${setUrl}` },
      { "@type": "ListItem", position: 4, name: card.name, item: `${SITE_URL}${cardUrl}` },
    ],
  };

  // Other printings of this exact card (promo / alt-art / Signature share the
  // name). Cross-links the variant cluster so each printing has distinct inbound
  // anchors + copy — near-duplicate clusters with no differentiation are a classic
  // "Discovered/Crawled – currently not indexed" cause.
  const printings = await prisma.card.findMany({
    where: { name: card.name, id: { not: card.id } },
    orderBy: [{ setCode: "asc" }, { collectorNumber: "asc" }],
    select: cardTileSelect(DEFAULT_COUNTRY),
  });

  // Similar cards — more from the same set, same domain first. This is the single
  // biggest internal-linking lever: every long-tail card page links out to ~12
  // sibling card pages, which is what gets them crawled and indexed. Priced cards
  // first (more useful, and they're the ones people search). Falls back to other
  // cards in the set when a domain is thin, so the row is never near-empty.
  const SIMILAR_TAKE = 12;
  const similarSelect = cardTileSelect(DEFAULT_COUNTRY);
  const similarOrder = [
    { lowestPriceCents: { sort: "desc" as const, nulls: "last" as const } },
    { collectorNumber: "asc" as const },
  ];
  const sameDomain = await prisma.card.findMany({
    where: { setCode: card.setCode, domain: card.domain, id: { not: card.id } },
    orderBy: similarOrder,
    take: SIMILAR_TAKE,
    select: similarSelect,
  });
  let similar = sameDomain;
  if (similar.length < 6) {
    const seen = new Set(similar.map((c) => c.id));
    const fill = await prisma.card.findMany({
      where: { setCode: card.setCode, id: { notIn: [card.id, ...seen] } },
      orderBy: similarOrder,
      take: SIMILAR_TAKE - similar.length,
      select: similarSelect,
    });
    similar = [...similar, ...fill];
  }
  const similarHeading =
    card.domain === "Colorless"
      ? `More cards from ${card.setName}`
      : `More ${card.domain} cards from ${card.setName}`;

  // Meta decks that play this card — card ↔ deck internal links (and a "what's this
  // card for?" signal for shoppers). Static seed lookup, no DB call.
  const relatedDecks = decksUsingCard(card.name).slice(0, 6);

  return (
    <div>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <CardViewBeacon idOrSlug={card.slug ?? card.id} />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-400">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/" className="hover:text-white">Home</Link></li>
          <li className="text-ink-700">/</li>
          <li><Link href="/browse" className="hover:text-white">Cards</Link></li>
          <li className="text-ink-700">/</li>
          <li><Link href={setUrl} className="hover:text-white">{card.setName}</Link></li>
          <li className="text-ink-700">/</li>
          <li className="text-slate-300" aria-current="page">{card.name}</li>
        </ol>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Card visual */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="card-surface mx-auto max-w-[320px] p-4">
            <CardImage card={card} full priority className="aspect-[5/7] w-full" />
          </div>
        </div>

        {/* Details + price comparison */}
        <div className="min-w-0">
          <div className="card-surface p-5">
            <div className="flex flex-wrap items-center gap-2">
              <DomainBadge domain={card.domain} href={`/domains/${domainSlug(card.domain)}`} />
              <RarityBadge rarity={card.rarity} />
              <span className="chip bg-ink-800 text-slate-300">{card.type}</span>
              <VariantBadge variant={card.variant} />
              <SignatureBadge show={isSignature(card.collectorNumber)} />
              <OvernumberedBadge show={isOvernumbered(card.collectorNumber)} />
              <PromoBadge show={card.isPromo} />
            </div>
            <div className="mt-3 flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-extrabold text-white">{displayName}</h1>
                <p className="mt-1 font-mono text-xs text-slate-500">
                  {card.setName} ({card.setCode}) · {card.collectorNumber}
                </p>
              </div>
              <WishlistButton cardId={card.id} variant="full" />
              <ShareButton />
            </div>

            {/* Market-localised metrics (SSR = AU baseline; client reconciles). */}
            <CardPriceMetrics rows={rows} energyCost={card.energyCost} might={card.might} power={card.power} />
          </div>

          {/* Price comparison + eBay fallback + contextual affiliate banners —
              everything that varies with the visitor's market lives in the client
              section so the route itself stays cookie-free and ISR-cacheable. */}
          <CardPriceComparison
            rows={rows}
            displayName={displayName}
            ebaySearch={ebaySearch}
            ebayQuery={`${card.name} ${card.collectorNumber}`}
          />

          {/* Price-history chart — free for everyone (AU history; the series is
              collected on the AU baseline market). */}
          <PriceHistoryChart cardId={card.id} />

          {/* AI Tips — funny, narrative buy/hold/wait take grounded in the price data. */}
          <section className="card-surface mt-6 p-5">
            <AiInsight cardId={card.id} />
          </section>

          {/* Thinking of selling? Net-proceeds — what you'd actually pocket after
              fees. Prefilled with the AU-baseline price (the component re-prices
              to the visitor's market); collapsed so it never blocks a buyer. */}
          {card.lowestPriceCents != null && (
            <details className="mt-6 card-surface group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-bold text-white [&::-webkit-details-marker]:hidden">
                <span>Thinking of selling? See what you&apos;d pocket</span>
                <svg className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <div className="border-t border-ink-700 p-4">
                <NetProceeds initialPriceCents={card.lowestPriceCents} />
              </div>
            </details>
          )}

          {/* In-content ad — below the price table the visitor came for, so it never
              gets between them and the prices. Activates when a slot id is set. */}
          <AdSlot className="mt-6" height={120} />

          {/* Unique, crawlable editorial content — keeps each card page from being
              thin (a bare price table). Generated per-card, so no duplication. */}
          <section className="card-surface mt-6 p-5">
            <h2 className="font-bold text-white">About {card.name}</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-300">
              {about.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {card.description && <p className="text-slate-400">{card.description}</p>}
              {card.flavorText && <p className="italic text-slate-500">&ldquo;{card.flavorText}&rdquo;</p>}
            </div>
            {tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {tags.map((t) => (
                  <span key={t} className="chip bg-ink-800 text-slate-400">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="card-surface mt-6 p-5">
            <h2 className="font-bold text-white">Frequently asked questions</h2>
            <dl className="mt-3 space-y-4">
              {faqs.map((f) => (
                <div key={f.q}>
                  <dt className="font-semibold text-white">{f.q}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-slate-400">{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>

      {/* Other printings — promo/alt-art/Signature versions of this exact card.
          Cross-links the variant cluster (each printing is its own product with its
          own price) so no printing is an unreferenced near-duplicate. */}
      {printings.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-1 text-xl font-extrabold text-white">Other printings of {card.name}</h2>
          <p className="mb-4 text-xs text-slate-500">
            Same card, different printing — promos, alternate arts and premium prints each trade at their own price.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {printings.map((c) => (
              <CardTile key={c.id} card={c} />
            ))}
          </div>
        </section>
      )}

      {/* Played in — meta decks that run this card. Card ↔ deck internal links,
          and a useful "what do I build with this?" prompt for buyers. */}
      {relatedDecks.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-1 text-xl font-extrabold text-white">Played in these decks</h2>
          <p className="mb-4 text-xs text-slate-500">
            {displayName} sees play in {relatedDecks.length === 1 ? "this meta deck" : `${relatedDecks.length} meta decks`} — open one for the full list and its build cost.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {relatedDecks.map((d) => (
              <Link
                key={d.slug}
                href={`/decks/${d.slug}`}
                className="card-surface group flex flex-col gap-1 p-4 transition-colors hover:border-brand-500"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white group-hover:text-brand-300">{d.name}</span>
                  {d.tier && <span className="chip ml-auto bg-ink-800 text-[10px] text-slate-400">{d.tier}</span>}
                </div>
                <span className="text-xs text-slate-500">{d.archetype}</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {d.domains.map((dm) => (
                    <DomainBadge key={dm} domain={dm} />
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Similar cards — internal links to sibling card pages (same set/domain).
          Server-rendered so the links are in the crawlable HTML. */}
      {similar.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold text-white">{similarHeading}</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Compare prices on similar Riftbound {card.setName} singles.
              </p>
            </div>
            <Link href={setUrl} className="btn-ghost text-xs shrink-0">
              View all {card.setName} →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {similar.map((c) => (
              <CardTile key={c.id} card={c} />
            ))}
          </div>
        </section>
      )}

      {/* Embeddable live-price widget — a free backlink/brand engine. (AU default
          market in the snippet; the widget itself accepts a ?market= override.) */}
      <EmbedCardButton slug={card.slug ?? card.id} market={DEFAULT_COUNTRY} />
    </div>
  );
}

type CardForCopy = {
  name: string;
  setName: string;
  setCode: string;
  collectorNumber: string;
  domain: string;
  type: string;
  rarity: string;
  variant: string | null;
  isPromo: boolean;
  energyCost: number | null;
  might: number | null;
  power: number | null;
};

// Builds 2 short paragraphs of unique prose from the card's own attributes.
// MARKET-NEUTRAL (this page is cached once for all four markets): the price cited
// is the AU baseline, named explicitly, with the other markets acknowledged.
function buildAbout(card: CardForCopy, lowest: number | null, stores: number): string[] {
  let p1 = `${card.name} is a ${card.rarity.toLowerCase()} ${card.type.toLowerCase()} card from ${card.setName} (${card.setCode}), a set in the Riftbound trading card game, with collector number ${card.collectorNumber}.`;
  p1 += card.domain === "Colorless"
    ? " It is a Colorless card, so it fits into decks of any domain."
    : ` It belongs to the ${card.domain} domain.`;
  if (card.energyCost != null) {
    p1 += ` ${card.name} costs ${card.energyCost} energy to play`;
    if (card.might != null) p1 += ` and has ${card.might} might`;
    else if (card.power != null) p1 += ` and has ${card.power} power`;
    p1 += ".";
  }
  // Printing credentials — each printing is a distinct product with its own price,
  // and spelling that out is what keeps variant pages from reading as duplicates.
  if (card.rarity === "Showcase") p1 += ` This is the Showcase printing — a special-art version of the base card with its own market price.`;
  else if (card.variant) p1 += ` This listing covers the alternate-art (${card.variant}) printing, which trades separately from the base version.`;
  if (isSignature(card.collectorNumber)) p1 += " As a Signature print (numbered beyond the set), it is pulled far less often than base cards and commands a premium.";
  else if (isOvernumbered(card.collectorNumber)) p1 += " As an overnumbered print (numbered beyond the set's base size), it is rarer than the base printing.";
  if (card.isPromo) p1 += " It is a promotional printing — it shares the base card's collector number but is a distinct product with its own price.";

  const p2 = lowest != null && stores > 0
    ? `The lowest tracked price for ${card.name} today is ${formatMoney(lowest)} in Australia, across ${stores} ${stores === 1 ? "store" : "stores"} — RiftCompare also compares New Zealand, US and UK stores, ranked by delivered cost and refreshed daily.`
    : `We're currently tracking down store listings for ${card.name}. Prices refresh daily across Australian, New Zealand, US and UK stores — check back soon or add it to your wishlist to be ready the moment it's in stock.`;

  return [p1, p2];
}

function buildFaqs(card: CardForCopy, lowest: number | null, stores: number): { q: string; a: string }[] {
  return [
    {
      q: `How much does ${card.name} cost?`,
      a: lowest != null && stores > 0
        ? `The cheapest live price for ${card.name} (${card.setCode} ${card.collectorNumber}) is currently ${formatMoney(lowest)} across ${stores} Australian ${stores === 1 ? "store" : "stores"}; New Zealand, US and UK prices are compared on this page too. Prices update daily.`
        : `We don't have a live price for ${card.name} right now. Prices refresh daily across AU, NZ, US and UK stores — check back soon for the cheapest place to buy it.`,
    },
    {
      q: `What set is ${card.name} from?`,
      a: `${card.name} is card ${card.collectorNumber} from ${card.setName} (${card.setCode}) in the Riftbound TCG. It is a ${card.rarity.toLowerCase()} ${card.type.toLowerCase()}${card.domain === "Colorless" ? "" : ` in the ${card.domain} domain`}.`,
    },
    {
      q: `Where can I buy ${card.name}?`,
      a: `Compare every store selling ${card.name} across Australia, New Zealand, the US and the UK on this page, then buy from whichever retailer offers the lowest total price including postage. RiftCompare links straight through to each store.`,
    },
  ];
}
