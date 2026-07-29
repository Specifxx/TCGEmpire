import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { CardImage } from "@/components/CardImage";
import { DomainBadge, RarityBadge, VariantBadge, OvernumberedBadge, PromoBadge, SignatureBadge, CrystalRoseBadge } from "@/components/Badge";
import { isOvernumbered, isSignature, isCrystalRose } from "@/lib/constants";
import { PriceWatchButton } from "@/components/PriceWatchButton";
import { ShareButton } from "@/components/ShareButton";
import { CardViewBeacon } from "@/components/CardViewBeacon";
import { formatMoney } from "@/lib/format";
import { effectiveShippingCents, shippingPolicyUrl } from "@/lib/retailers";
import { affiliateUrl, ebayAffiliateUrl } from "@/lib/affiliate";
import { cardDisplayName, cardSearchName } from "@/lib/card-name";
import { CardTile } from "@/components/CardTile";
import { cardTileSelect } from "@/lib/cards";
import { AdSlot } from "@/components/AdSlot";
import { EmbedCardButton } from "@/components/EmbedCardButton";
import { COUNTRIES, DEFAULT_COUNTRY, isoCountry, priceField, type Country } from "@/lib/country";
import { setByCode } from "@/lib/constants";
import { domainSlug } from "@/lib/domains";
import { decksUsingCard } from "@/lib/meta-decks";
import { SITE_URL } from "@/lib/site";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { getPriceHistory, type PricePoint } from "@/lib/price-history";
import { CardConversionCta } from "@/components/CardConversionCta";
import { AiInsight } from "@/components/AiInsight";
import { CardPriceMetrics, CardPriceComparison, type EbaySearchMap } from "@/components/CardMarketSection";
import { MarketplaceHeroBlock } from "@/components/MarketplaceHeroBlock";
import { getActiveListingsForCard } from "@/lib/marketplace";
import { EbayAdCarousel } from "@/components/EbayAdCarousel";
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

// The market the cached page is rendered on. Metadata MUST agree with it: the
// snippet previously quoted the AU column + AU store count while the page body
// rendered DEFAULT_COUNTRY, so the promised price and the visible price could be
// from two different countries.
const BASELINE_CURRENCY = COUNTRIES[DEFAULT_COUNTRY].currency;
const fmtBaselineMoney = (cents: number) => formatMoney(cents, BASELINE_CURRENCY);

// Trim printed card text down to something that survives a ~160-char meta
// description without cutting mid-word.
function clampText(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, "")}…`;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const card = await prisma.card.findFirst({
    where: whereParam(params.id),
    select: {
      slug: true, name: true, setName: true, setCode: true, collectorNumber: true,
      variant: true, isPromo: true, rarity: true, type: true, domain: true,
      description: true,
      [priceField(DEFAULT_COUNTRY)]: true,
      // Live in-stock retailer keys FOR THE BASELINE MARKET — a real number in the
      // snippet is the CTR lever this vertical runs on. Rows are unique per
      // [retailer, condition, isFoil], so count DISTINCT retailers or one store's
      // NM + foil listings would read as "2 stores".
      retailerPrices: { where: { country: DEFAULT_COUNTRY, inStock: true }, select: { retailer: true } },
    } as Record<string, unknown>,
  }) as (Record<string, unknown> & {
    slug: string | null; name: string; setName: string; setCode: string; collectorNumber: string;
    variant: string | null; isPromo: boolean; rarity: string; type: string; domain: string;
    description: string | null;
    retailerPrices: { retailer: string }[];
  }) | null;
  if (!card) notFound(); // real 404 — metadata resolves before streaming

  const lowestCents = card[priceField(DEFAULT_COUNTRY)] as number | null;

  // The display name carries the printing credentials (Promo/Alt Art/Signature…)
  // so variant printings that share a name + number stop emitting byte-identical
  // titles — duplicate-looking clusters are exactly what Google leaves unindexed.
  const displayName = cardDisplayName(card.name, card);
  const stores = new Set(card.retailerPrices.map((r) => r.retailer)).size;
  const hasPrice = lowestCents != null && stores > 0;

  // TITLE — card name FIRST (the actual query is "<card name> riftbound", not
  // "<card name> price"), then the identifiers that disambiguate printings, then
  // the value props. "Prices" only leads when we genuinely have a price to show;
  // promising a price on a page that renders "—" is what earns a pogo-stick back
  // to the SERP and suppresses the whole cluster's CTR.
  //
  // Built longest-first and stepped down so the card name + "Riftbound" + set id
  // always survive Google's ~60-char truncation on even the longest legend names.
  const ident = `Riftbound ${card.setCode} ${card.collectorNumber}`;
  const tail = hasPrice ? "Card Text & Live Prices" : "Card Text, Stats & Printings";
  const titleCandidates = [
    `${displayName} — ${ident} | ${tail}`,
    `${displayName} — ${ident} | ${hasPrice ? "Live Prices" : "Card Text"}`,
    `${displayName} — ${ident}`,
    `${displayName} — Riftbound ${card.setCode}`,
  ];
  const title = titleCandidates.find((t) => t.length <= 62) ?? titleCandidates[titleCandidates.length - 1];

  // DESCRIPTION — lead with what the card DOES (the informational half of the
  // intent), then the commercial half. Degrades in three steps so a card with no
  // printed text and no price still gets a unique, non-boilerplate sentence.
  const textBit = card.description ? clampText(card.description, 90) : null;
  const statBit = `${card.domain} ${card.type.toLowerCase()} · ${card.rarity}`;
  const priceBit = hasPrice
    ? `Live prices from ${fmtBaselineMoney(lowestCents!)} across ${stores} ${stores === 1 ? "store" : "stores"}, updated daily.`
    : `Compare live prices across AU, NZ, US, UK & SG stores, updated daily.`;
  const description = textBit
    ? `${displayName} (${ident}) — ${textBit} ${priceBit}`
    : `${displayName} — ${statBit} from Riftbound ${card.setName} (${card.collectorNumber}). ${priceBit}`;

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
  // Consolidate to the canonical slug URL: a legacy/raw-cuid URL 308s to the slug so
  // link equity, analytics and the ISR cache aren't split across two live URLs for
  // the same card. (Only when a slug exists — un-backfilled cards still serve on id.)
  if (card.slug && params.id !== card.slug) permanentRedirect(`/card/${card.slug}`);

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
    buyHref: affiliateUrl(p.url, p.retailer, `${SITE_URL}/card/${card.slug ?? params.id}`),
    policyUrl: shippingPolicyUrl(p.retailer),
  }));

  // BASELINE view for the cached HTML — structured data, prose and FAQ. This is
  // the same market the SSR'd client components render before hydration, i.e.
  // DEFAULT_COUNTRY, whatever that currently is.
  //
  // It used to be called `au` and everything downstream assumed Australia:
  // figures were formatted with a hardcoded AUD formatter, the prose said "in
  // Australia" / "Australian stores", and the Product JSON-LD emitted
  // priceCurrency:"AUD". DEFAULT_COUNTRY was later changed to "US" and none of
  // that followed, so every card page was publishing US prices labelled as AUD —
  // including in structured data, where a figure that contradicts the visible
  // page is exactly what makes Google drop a Product rich result.
  //
  // `baseline` now carries its own market + currency (see MarketView), and every
  // consumer below reads them from it instead of assuming.
  const baseline = computeMarket(rows, DEFAULT_COUNTRY);
  const baselinePlace = COUNTRIES[baseline.market].place;
  const fmtBaseline = (cents: number) => formatMoney(cents, baseline.currency);

  // eBay fallback search per market, precomputed (affiliate tagging is server-side).
  // Built for EVERY market and shown by the client section whenever that market has
  // no live eBay row — whether we couldn't check eBay this cycle (quota) or eBay
  // genuinely had nothing at last check, a zero-listing market must never be a dead
  // end. NZ has no local eBay; eBay AU ships there.
  const EBAY_MKT: Record<string, { domain: string; label: string }> = {
    AU: { domain: "ebay.com.au", label: "eBay Australia" },
    NZ: { domain: "ebay.com.au", label: "eBay AU (ships to NZ)" },
    US: { domain: "ebay.com", label: "eBay" },
    UK: { domain: "ebay.co.uk", label: "eBay UK" },
    SG: { domain: "ebay.com.sg", label: "eBay Singapore" },
  };
  // Special printings (Signature/Overnumbered/Alt Art/Showcase/Promo) need their
  // credentials IN the search query — searching just the base name only ever
  // surfaces the base card's listings, which is useless for the printing this
  // page is actually about.
  const ebaySearchTerm = `${cardSearchName(card.name, card)} Riftbound`;
  const ebaySearch: EbaySearchMap = Object.fromEntries(
    Object.entries(EBAY_MKT).map(([c, mkt]) => [
      c,
      {
        url: ebayAffiliateUrl(`https://www.${mkt.domain}/sch/i.html?_nkw=${encodeURIComponent(ebaySearchTerm)}`),
        label: mkt.label,
        nz: c === "NZ",
      },
    ])
  );

  // Structured data so Google can show a rich price snippet ("$X, N stores").
  // Google requires a Product to carry "offers", "review", or "aggregateRating";
  // a Product without any of these is a critical Search Console error. So we only
  // emit the Product markup when we actually have priced, in-stock offers to back
  // it — unpriced cards simply omit it rather than emit an invalid empty Product.
  //
  // Marketplace listings (once MARKETPLACE_PUBLIC) join as individual Offer
  // entries alongside the store AggregateOffer — the card page IS the product
  // page Google sees for each listing; there are deliberately no per-listing
  // pages (thin/duplicate content that 404s when sold). Freshness is handled by
  // revalidateCardPage() firing on every listing mutation.
  const mpListings = await getActiveListingsForCard(card.id).catch(() => []);
  // priceValidUntil = now + 1 day: store prices refresh on the daily import and
  // listing churn re-renders the page on-demand, so each snapshot is honest
  // until the next pass overwrites it.
  const priceValidUntil = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);
  const hasStoreOffers = baseline.prices.length > 0 && baseline.lowest != null;
  // Google's "merchant listing" price/shipping/returns snippet requires every
  // Offer to declare shippingDetails + hasMerchantReturnPolicy (missing either
  // is flagged in Search Console and can suppress the enhanced display). We can
  // only declare these HONESTLY where we're the actual merchant of record —
  // RiftCompare's own Marketplace, where a listing's real flat shipping rate and
  // our own (real, documented) buyer-protection terms are known facts. The store
  // AggregateOffer above aggregates many independent third-party retailers we
  // don't control shipping/returns for, so it deliberately carries neither field
  // rather than assert something that isn't true for at least some of them.
  // Our buyer protection (see /marketplace/buyer-protection) covers "item never
  // arrived / not as described / damaged", not ordinary change-of-mind returns —
  // MerchantReturnUnspecified is the honest schema.org category for that shape of
  // guarantee, rather than overclaiming a standard return window we don't offer.
  // applicableCountry is per-listing since the Marketplace serves several markets.
  const marketplaceReturnPolicy = (listingCountry: string) => ({
    "@type": "MerchantReturnPolicy",
    returnPolicyCategory: "https://schema.org/MerchantReturnUnspecified",
    applicableCountry: isoCountry(listingCountry as Country),
  });
  const offersLd = [
    ...(hasStoreOffers
      ? [{
          "@type": "AggregateOffer",
          // From the view itself — NEVER hardcoded. This line said "AUD" while
          // the figures below were DEFAULT_COUNTRY's (US/USD), publishing a
          // currency that contradicted the visible page on every card.
          priceCurrency: baseline.currency,
          lowPrice: (baseline.lowest! / 100).toFixed(2),
          highPrice: (baseline.prices[baseline.prices.length - 1].priceCents / 100).toFixed(2),
          offerCount: baseline.prices.length,
          availability: "https://schema.org/InStock",
          priceValidUntil,
        }]
      : []),
    ...mpListings.map((l) => {
      const shipCents = l.seller.sellerProfile?.shippingFlatCents;
      return {
        "@type": "Offer",
        price: (l.priceCents / 100).toFixed(2),
        priceCurrency: l.currency,
        availability: "https://schema.org/InStock",
        itemCondition: l.condition === "NM" ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition",
        seller: { "@type": "Organization", name: l.seller.sellerProfile?.shopName ?? l.seller.displayName },
        url: `${SITE_URL}/card/${card.slug ?? params.id}#marketplace-listings`,
        priceValidUntil,
        // The seller's own real flat rate (see SellerProfile.shippingFlatCents) —
        // omitted rather than guessed when a seller hasn't set one.
        ...(shipCents != null
          ? {
              shippingDetails: {
                "@type": "OfferShippingDetails",
                shippingRate: { "@type": "MonetaryAmount", value: (shipCents / 100).toFixed(2), currency: l.currency },
                shippingDestination: { "@type": "DefinedRegion", addressCountry: isoCountry(l.country as Country) },
              },
            }
          : {}),
        hasMerchantReturnPolicy: marketplaceReturnPolicy(l.country),
      };
    }),
  ];
  const jsonLd = offersLd.length
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: displayName,
        category: "Trading Card",
        description: `${displayName} — Riftbound ${card.setName} (${card.setCode}) ${card.collectorNumber}. Compare live store prices.`,
        ...(card.imageUrl ? { image: card.imageUrl } : {}),
        offers: offersLd.length === 1 ? offersLd[0] : offersLd,
      }
    : null;

  const tags = (card.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);

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

  // "More {Champion} cards" — cross-SET topical cluster (e.g. every Jinx card across
  // Origins/Unleashed/Spiritforged). The champion is the name before the comma
  // ("Jinx, Loose Cannon" → "Jinx"); only Legend/unit cards are named that way, so
  // spells/runes (no comma) simply skip this module. One extra query, champion cards
  // only. Excludes this card's own other printings (same full name).
  const champion = card.name.includes(",") ? card.name.split(",")[0].trim() : null;
  const championCards = champion
    ? await prisma.card.findMany({
        where: { name: { startsWith: `${champion},`, not: card.name }, id: { not: card.id } },
        orderBy: [{ lowestPriceCents: { sort: "desc", nulls: "last" } }, { setCode: "asc" }],
        take: 6,
        select: cardTileSelect(DEFAULT_COUNTRY),
      })
    : [];

  // Meta decks that play this card — card ↔ deck internal links (and a "what's this
  // card for?" signal for shoppers). Static seed lookup, no DB call.
  const allRelatedDecks = decksUsingCard(card.name);
  const relatedDecks = allRelatedDecks.slice(0, 6);

  // AU price history (day-cached — see lib/price-history) reused here for the
  // genuine price-trend paragraph below. Same cache key as the chart's own fetch
  // (default take=120), so this never doubles the day's history read.
  const history = await getPriceHistory(card.id, DEFAULT_COUNTRY);

  // Unique editorial copy + FAQ so each card page carries substantive, crawlable
  // text rather than just a price table (thin content ranks poorly). Built from
  // this card's own attributes AND its real tracked history/deck/printing data —
  // no two pages match, and nothing here is asserted without the data to back it.
  const about = buildAbout(card, {
    lowest: baseline.lowest,
    stores: baseline.storeCount,
    history,
    deckCount: allRelatedDecks.length,
    printingCount: printings.length,
    place: baselinePlace,
    currency: baseline.currency,
  });
  const faqs = buildFaqs(card, {
    lowest: baseline.lowest,
    stores: baseline.storeCount,
    printingCount: printings.length,
    deckCount: allRelatedDecks.length,
    deckNames: allRelatedDecks.slice(0, 2).map((d) => d.name),
    place: baselinePlace,
    currency: baseline.currency,
  });
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

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
              <CrystalRoseBadge show={isCrystalRose(card.setCode, card.collectorNumber)} />
              <PromoBadge show={card.isPromo} />
            </div>
            <div className="mt-3 flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-extrabold text-white">{displayName}</h1>
                <p className="mt-1 font-mono text-xs text-slate-500">
                  {card.setName} ({card.setCode}) · {card.collectorNumber}
                </p>
              </div>
              <PriceWatchButton cardId={card.id} variant="full" />
              <ShareButton />
            </div>

            {/* Market-localised metrics (SSR = AU baseline; client reconciles). */}
            <CardPriceMetrics rows={rows} energyCost={card.energyCost} might={card.might} power={card.power} />

            {/* Primary singles buy-path — always present. eBay carries this card
                (new/used/graded) in every market and pays us a commission, so it's
                the first, always-visible buy action; the honest local price
                comparison sits directly below it. Shows real live listings (a
                native "eBay Ad" carousel) when the daily import has cached any
                for this card+market, falling back to the generic search CTA
                otherwise. */}
            <EbayAdCarousel cardId={card.id} query={cardSearchName(card.name, card)} className="mt-4" />
          </div>

          {/* RiftCompare Marketplace hero — the main attention-grab, shown only
              when this card actually has active P2P listings. Sits above the
              store price comparison so a marketplace deal is the first thing a
              buyer sees when one exists. */}
          <MarketplaceHeroBlock cardId={card.id} cardName={displayName} />

          {/* Price comparison + eBay fallback + contextual affiliate banners —
              everything that varies with the visitor's market lives in the client
              section so the route itself stays cookie-free and ISR-cacheable. */}
          <CardPriceComparison
            rows={rows}
            displayName={displayName}
            ebaySearch={ebaySearch}
            ebayQuery={`${cardSearchName(card.name, card)} ${card.collectorNumber}`}
          />

          {/* Price-history chart — free for everyone (AU history; the series is
              collected on the AU baseline market). */}
          <PriceHistoryChart cardId={card.id} />

          {/* Conversion island (client → route stays ISR): watch-this-price email
              capture + a Value Finder teaser for non-members. */}
          <div className="mt-6">
            <CardConversionCta cardId={card.id} />
          </div>

          {/* AI Tips — funny, narrative buy/hold/wait take grounded in the price data. */}
          <section className="card-surface mt-6 p-5">
            <AiInsight cardId={card.id} />
          </section>

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
                  // Real crawlable links to a tag-filtered browse view — internal-link
                  // distribution + a "same keyword/archetype" hub (was a dead <span>).
                  <Link
                    key={t}
                    href={`/browse?tag=${encodeURIComponent(t)}`}
                    className="chip bg-ink-800 text-slate-400 transition-colors hover:bg-ink-700 hover:text-slate-200"
                  >
                    {t}
                  </Link>
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

      {/* Cross-set champion cluster — internal links that build the topical hub this
          vertical ranks on ("Jinx cards", "Ahri cards", …). */}
      {championCards.length > 0 && champion && (
        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="text-xl font-extrabold text-white">More {champion} cards</h2>
            <Link href={`/browse?q=${encodeURIComponent(champion)}`} className="btn-ghost text-xs shrink-0">
              All {champion} cards →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {championCards.map((c) => (
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

// Real, tracked min/max/direction over the card's own baseline-market history —
// never asserts a trend without enough data points to back it (a fresh card just
// skips this paragraph rather than guessing). `place`/`currency` describe the
// market the history belongs to; they are passed in rather than assumed, because
// this used to say "Australian price" over DEFAULT_COUNTRY's figures.
function buildTrend(name: string, history: PricePoint[], place: string, currency: string): string | null {
  if (history.length < 4) return null;
  const recent = history.slice(-35); // ~5 tracked weeks, matches the chart's usual window
  const vals = recent.map((p) => p.v);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const first = recent[0].v;
  const last = recent[recent.length - 1].v;
  const days = Math.max(1, Math.round((recent[recent.length - 1].t - recent[0].t) / 86400_000));
  if (lo === hi) {
    return `Over the past ${days} days of tracked history, ${name}'s price in ${place} has held steady at ${formatMoney(lo, currency)}.`;
  }
  const trendWord = last > first ? "risen" : last < first ? "fallen" : "held steady";
  return `Over the past ${days} days, ${name} has traded between ${formatMoney(lo, currency)} and ${formatMoney(hi, currency)} in ${place}, and has ${trendWord} since the start of that window — see the full price history chart below.`;
}

type AboutContext = {
  lowest: number | null;
  stores: number;
  history: PricePoint[];
  deckCount: number;
  printingCount: number;
  // The baseline market these figures belong to. Passed in rather than assumed:
  // this prose used to hardcode "Australia"/AUD while the numbers were actually
  // DEFAULT_COUNTRY's (see the note on `baseline` in CardPage).
  place: string;
  currency: string;
};

// Builds unique prose from the card's own attributes, its REAL tracked price
// history and its actual deck/printing data — nothing here is asserted without the
// data on this page render to back it, so a thin/new card simply gets fewer
// paragraphs rather than a fabricated one. MARKET-NEUTRAL (this page is cached once
// for all four markets): the price cited is the AU baseline, named explicitly.
function buildAbout(card: CardForCopy, ctx: AboutContext): string[] {
  const { lowest, stores, history, deckCount, printingCount, place, currency } = ctx;
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
  if (isCrystalRose(card.setCode, card.collectorNumber)) p1 += " It's one of the six Crystal Rose alt-arts — Wild Rift's returning skin line brought to physical cards for Vendetta — appearing at the same rate as other alt-art pulls in booster packs.";
  if (card.isPromo) p1 += " It is a promotional printing — it shares the base card's collector number but is a distinct product with its own price.";

  const p2 = lowest != null && stores > 0
    ? `The lowest tracked price for ${card.name} today is ${formatMoney(lowest, currency)} in ${place}, across ${stores} ${stores === 1 ? "store" : "stores"} — RiftCompare also compares every other market we cover, ranked by delivered cost and refreshed daily.`
    : `We're currently tracking down store listings for ${card.name}. Prices refresh daily across Australian, New Zealand, US, UK and Singapore stores — check back soon or add it to your wishlist to be ready the moment it's in stock.`;

  const paragraphs = [p1, p2];

  const trend = buildTrend(card.name, history, place, currency);
  if (trend) paragraphs.push(trend);

  // Deck usage + sibling-printing context — only the parts that are actually true
  // for this card, so a card with neither simply doesn't get this paragraph.
  const bits: string[] = [];
  if (deckCount > 0) bits.push(`sees play in ${deckCount} meta deck${deckCount === 1 ? "" : "s"} tracked on RiftCompare`);
  if (printingCount > 0) bits.push(`has ${printingCount} other tracked printing${printingCount === 1 ? "" : "s"} — promo, alternate-art or Signature versions, each trading at its own price`);
  if (bits.length) paragraphs.push(`${card.name} ${bits.join(", and ")}.`);

  return paragraphs;
}

type FaqContext = {
  lowest: number | null;
  stores: number;
  printingCount: number;
  deckCount: number;
  deckNames: string[];
  place: string;
  currency: string;
};

function buildFaqs(card: CardForCopy, ctx: FaqContext): { q: string; a: string }[] {
  const { lowest, stores, printingCount, deckCount, deckNames, place, currency } = ctx;
  const faqs = [
    {
      q: `How much does ${card.name} cost?`,
      a: lowest != null && stores > 0
        ? `The cheapest live price for ${card.name} (${card.setCode} ${card.collectorNumber}) is currently ${formatMoney(lowest, currency)} across ${stores} ${stores === 1 ? "store" : "stores"} in ${place}; every other market we cover is compared on this page too. Prices update daily.`
        : `We don't have a live price for ${card.name} right now. Prices refresh daily across AU, NZ, US, UK and SG stores — check back soon for the cheapest place to buy it.`,
    },
    {
      q: `What set is ${card.name} from?`,
      a: `${card.name} is card ${card.collectorNumber} from ${card.setName} (${card.setCode}) in the Riftbound TCG. It is a ${card.rarity.toLowerCase()} ${card.type.toLowerCase()}${card.domain === "Colorless" ? "" : ` in the ${card.domain} domain`}.`,
    },
    {
      q: `Where can I buy ${card.name}?`,
      a: `Compare every store selling ${card.name} across Australia, New Zealand, the US, the UK and Singapore on this page, then buy from whichever retailer offers the lowest total price including postage. RiftCompare links straight through to each store.`,
    },
  ];

  if (printingCount > 0) {
    faqs.push({
      q: `Are there other printings of ${card.name}?`,
      a: `Yes — RiftCompare tracks ${printingCount} other printing${printingCount === 1 ? "" : "s"} of ${card.name} (promo, alternate-art and/or Signature versions), each a distinct product trading at its own price. See them all further down this page.`,
    });
  }
  if (deckCount > 0) {
    const named = deckNames.length ? ` including ${deckNames.join(" and ")}` : "";
    faqs.push({
      q: `What decks use ${card.name}?`,
      a: `${card.name} is played in ${deckCount} meta deck${deckCount === 1 ? "" : "s"} tracked on RiftCompare${named}. See the full list and each deck's live build cost further down this page.`,
    });
  }

  return faqs;
}
