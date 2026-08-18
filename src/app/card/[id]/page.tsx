import type { Metadata } from "next";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { CardImage } from "@/components/CardImage";
import { DomainBadge, RarityBadge, VariantBadge, OvernumberedBadge, PromoBadge, SignatureBadge, CrystalRoseBadge } from "@/components/Badge";
import { isOvernumbered, isSignature, isCrystalRose, normaliseCondition } from "@/lib/constants";
import { PriceWatchButton } from "@/components/PriceWatchButton";
import { ShareButton } from "@/components/ShareButton";
import { CardViewBeacon } from "@/components/CardViewBeacon";
import { formatMoney, normalizeSearch } from "@/lib/format";
import { effectiveShippingCents, shippingPolicyUrl } from "@/lib/retailers";
import { affiliateUrl, ebayLabel, ebaySearchUrl } from "@/lib/affiliate";
import { cardCredentials, cardDisplayName, cardSearchName } from "@/lib/card-name";
import { CardTile } from "@/components/CardTile";
import { cardTileSelect } from "@/lib/cards";
import { AdSlot } from "@/components/AdSlot";
import { COUNTRIES, COUNTRY_LIST, DEFAULT_COUNTRY, isoCountry, priceField, type Country } from "@/lib/country";
import { setByCode } from "@/lib/constants";
import { domainSlug } from "@/lib/domains";
import { decksUsingCard } from "@/lib/meta-decks";
import { SITE_URL } from "@/lib/site";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { getPriceHistory } from "@/lib/price-history";
import { CardConversionCta } from "@/components/CardConversionCta";
import { AiInsight } from "@/components/AiInsight";
import { CardPriceMetrics, CardPriceComparison, type EbaySearchMap } from "@/components/CardMarketSection";
import { MarketplaceHeroBlock } from "@/components/MarketplaceHeroBlock";
import { getActiveListingsForCard } from "@/lib/marketplace";
import { EbayCardPanel } from "@/components/EbayCardPanel";
import { computeMarket, type MarketRow } from "@/lib/market-rows";
import { KeywordText } from "@/components/KeywordTooltip";
import { championForCardName, championCardWhere } from "@/lib/champions";
import { getCardPriceState } from "@/lib/card-price-state";
import { getCanonicalTwin } from "@/lib/card-duplicates";
import { typeFacetBySlug, rarityFacetBySlug } from "@/lib/facets";
import { pageOpenGraph } from "@/lib/seo";
import {
  buildCardNarrative,
  editionLabel,
  printingKind,
  printingLabel,
  tidy,
  PRINTING_DISPLAY,
  type NarrativeMarket,
} from "@/lib/content/card-narrative";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense";
import { guidesForCard } from "@/lib/content/related-guides";

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
      id: true,
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
    id: string;
    slug: string | null; name: string; setName: string; setCode: string; collectorNumber: string;
    variant: string | null; isPromo: boolean; rarity: string; type: string; domain: string;
    description: string | null;
    retailerPrices: { retailer: string }[];
  }) | null;
  if (!card) return notFoundMetadata("Card");

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
  // WHICH PRINTING THIS IS, in words rather than only in a collector number.
  //
  // 234 card pages — 17% of the template — were flagged as near-duplicate
  // descriptions of each other (GROWTH-AUDIT.md § 4). They are different
  // printings of the SAME card, and in the no-rules-text branch the only things
  // separating them were the collector number and the price. Both are digits,
  // and a near-duplicate detector — like Google's own clustering — discounts
  // digits, so two printings read as one sentence:
  //
  //   Lee Sin, Centered (Showcase) — Body unit · Showcase from Riftbound Origins (151a/298). Live prices from …
  //   Lee Sin, Centered (Showcase, Promo) — Body unit · Showcase from Riftbound Origins (151/298). Live prices from …
  //
  // printingLabel() is the same helper the page's own "Printing" cell and its
  // About narrative use, so the description cannot claim a printing the body
  // contradicts. Base printings get nothing added — there is no distinguishing
  // fact to state, and padding one in would be the fabrication this avoids.
  const printingBit = printingKind(card) === "base" ? "" : `the ${printingLabel(card)} printing of a `;
  const description = textBit
    ? `${displayName} (${ident}) — ${textBit} ${priceBit}`
    : `${displayName} — ${printingBit}${printingBit ? statBit.toLowerCase() : statBit} from Riftbound ${card.setName} (${card.collectorNumber}). ${priceBit}`;

  // ── Index only what's worth indexing ─────────────────────────────────────
  // A card with no in-stock listing in ANY market and under a week of recorded
  // history has nothing to compare — the page is a name, a badge and an empty
  // table. About a tenth of the catalogue is in that state at any time, so a
  // reviewer sampling /card/* URLs lands on one roughly one visit in ten. That
  // is the "low-value content" finding, and de-indexing is the honest fix:
  // follow:true keeps the link graph intact, and the page stays fully crawlable
  // (never a robots.txt Disallow — Google has to be able to READ the noindex,
  // and the AdSense crawler has to be able to fetch every page regardless).
  //
  // Reversible without human intervention: the same query drives the sitemap,
  // so gaining one listing — or a seventh day of history — puts the page back
  // in the index on the next regeneration. See lib/card-price-state.ts.
  // ── …and index only ONE URL per printing ─────────────────────────────────
  // A past import left duplicate rows for three promo printings, each with a
  // numeric slug suffix. They are the same card in every field the title is
  // built from, so they emit byte-identical titles. The extras keep working and
  // stay crawlable; they just point their canonical at the original and drop out
  // of the index. Nothing is deleted or renamed. See lib/card-duplicates.ts.
  const [priceState, twin] = await Promise.all([
    getCardPriceState(card),
    getCanonicalTwin(card),
  ]);
  const canonicalPath = `/card/${twin ? twin.slug ?? twin.id : card.slug ?? params.id}`;
  const noindex = !priceState.indexable || twin != null;

  return {
    title,
    description,
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    alternates: {
      canonical: canonicalPath,
      // Single cookie-switched URL is the global default for all four markets.
      languages: { "x-default": `${SITE_URL}${canonicalPath}` },
      // Machine-readable markdown for AI agents (rel=alternate type=text/markdown).
      types: { "text/markdown": `${SITE_URL}/llm${canonicalPath}` },
    },
    // og:image + twitter:image are provided by the co-located opengraph-image.tsx
    // (a branded price card: art + name + lowest live price).
    // pageOpenGraph(), not a bare object: Next SHALLOW-merges metadata, so an
    // inline openGraph REPLACES the root's and silently drops whatever it does
    // not restate — here og:url, on all ~1,400 card pages. lib/seo.ts exists for
    // exactly this and already carries siteName and type. See GROWTH-AUDIT.md § 5.
    openGraph: pageOpenGraph({ title, description, url: canonicalPath }),
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

  // Every market's view, for the cross-market price table further down. `rows`
  // already carries all six markets (no country filter server-side), so this is
  // free — the same computeMarket() call the client re-runs after hydration for
  // the visitor's own market, just run once per market here for the ISR-cached
  // HTML. Markets with no live listing are dropped rather than shown as "—".
  const marketPrices = COUNTRY_LIST.map((info) => ({ info, view: computeMarket(rows, info.code) })).filter(
    (x) => x.view.storeCount > 0 && x.view.lowest != null,
  );

  // eBay fallback search per market, precomputed (affiliate tagging is server-side).
  // Built for EVERY market and shown by the client section whenever that market has
  // no live eBay row — whether we couldn't check eBay this cycle (quota) or eBay
  // genuinely had nothing at last check, a zero-listing market must never be a dead
  // end. NZ has no local eBay; eBay AU ships there.
  //
  // Domain/label come from lib/affiliate.ts, not a local copy — this map used to
  // hand-list AU/NZ/US/UK/SG only, silently omitting CA from this fallback (a
  // Canadian visitor got no eBay search offer at all here, unlike every other
  // market). Iterating COUNTRY_LIST instead of a hand-kept object literal means
  // a future market can't be missed the same way twice.
  // Special printings (Signature/Overnumbered/Alt Art/Showcase/Promo) need their
  // credentials IN the search query — searching just the base name only ever
  // surfaces the base card's listings, which is useless for the printing this
  // page is actually about.
  const ebaySearchTerm = `${cardSearchName(card.name, card)} Riftbound`;
  const ebaySearch: EbaySearchMap = Object.fromEntries(
    COUNTRY_LIST.map((c) => [
      c.code,
      {
        url: ebaySearchUrl(c.code, ebaySearchTerm, "card-fallback"),
        label: ebayLabel(c.code),
        nz: c.code === "NZ",
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
  // Hoisted above the JSON-LD: the AggregateOffer needs a landing URL, and
  // Google's merchant-listing guidance lists offers.url as recommended — the
  // per-listing Offer nodes below already set one, so the aggregate was the odd
  // one out.
  const setInfoForLd = setByCode(card.setCode);
  const cardUrl = `/card/${card.slug ?? params.id}`;
  const cardAbsUrl = `${SITE_URL}${cardUrl}`;

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
          url: cardAbsUrl,
          priceValidUntil,
        }]
      : []),
    // One Offer per tracked store, alongside the AggregateOffer summary above —
    // this is where "total delivered cost" (the site's whole differentiator)
    // actually reaches structured data instead of living only in the visible
    // table. `row.ship` is the SAME effective-shipping figure already shown to
    // visitors (real per-listing cost where the source gives one, e.g. eBay;
    // otherwise the store's documented flat estimate — see
    // lib/market-rows.ts/effectiveShippingCents), so this asserts nothing the
    // page doesn't already claim. shippingDetails is omitted, not zeroed, for
    // the rare row where even that estimate is unknown ("at checkout").
    // hasMerchantReturnPolicy is deliberately NOT set here (unlike the
    // Marketplace Offers below) — return policy is a fact about the individual
    // third-party retailer that this data does not track, and asserting one
    // uniformly would be the same kind of overclaim the Marketplace policy note
    // above warns against.
    ...baseline.prices.map((row) => ({
      "@type": "Offer",
      price: (row.priceCents / 100).toFixed(2),
      priceCurrency: baseline.currency,
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: row.retailerName },
      url: row.buyHref,
      priceValidUntil,
      ...(row.ship != null
        ? {
            shippingDetails: {
              "@type": "OfferShippingDetails",
              shippingRate: { "@type": "MonetaryAmount", value: (row.ship / 100).toFixed(2), currency: baseline.currency },
              shippingDestination: { "@type": "DefinedRegion", addressCountry: isoCountry(baseline.market) },
            },
          }
        : {}),
    })),
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
  // Product is emitted ONLY when real offers exist. That is deliberate and stays:
  // Google treats a Product carrying none of offers/review/aggregateRating as a
  // critical error, so a card with no live listing is better off with no Product
  // markup than with an invalid one or a zero-filled price.
  //
  // (This is also why only a minority of the catalogue currently validates as
  // Product in Search Console — it tracks how many cards have an in-stock listing
  // in the BASELINE market, not how many pages carry correct markup. The fix for
  // that number is price coverage, not more schema.)
  //
  // Fields below are the ones Google actually reads for a merchant listing:
  // sku/productID make the printing uniquely addressable (collector number is
  // stable per printing), brand identifies the game, and description now carries
  // the card's REAL printed text rather than a templated sentence — matching the
  // visible page, which is what validation cross-checks.
  const jsonLd = offersLd.length
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        // Addressable node + edges back to the site-level graph declared once in
        // app/layout.tsx. Without them the site's highest-value page type is an
        // island and the Organization/WebSite entity signals don't reach it.
        "@id": `${cardAbsUrl}#product`,
        mainEntityOfPage: cardAbsUrl,
        name: displayName,
        category: "Trading Card",
        sku: `${card.setCode}-${card.collectorNumber}`,
        productID: `${card.setCode}-${card.collectorNumber}`,
        brand: { "@type": "Brand", name: "Riftbound" },
        // TWO memberships, both true: the printing belongs to its set, and the
        // page belongs to the site graph declared in app/layout.tsx. schema.org
        // allows isPartOf to take a list, so neither edge has to be dropped.
        isPartOf: [
          { "@type": "CreativeWorkSeries", name: `Riftbound ${card.setName}` },
          { "@id": `${SITE_URL}/#website` },
        ],
        description: card.description
          ? `${clampText(card.description, 300)} — ${displayName}, Riftbound ${card.setName} (${card.setCode}) ${card.collectorNumber}.`
          : `${displayName} — ${card.domain} ${card.type.toLowerCase()}, ${card.rarity}. Riftbound ${card.setName} (${card.setCode}) ${card.collectorNumber}.`,
        ...(card.imageUrl ? { image: card.imageUrl } : {}),
        additionalProperty: [
          { "@type": "PropertyValue", name: "Set", value: card.setName },
          { "@type": "PropertyValue", name: "Collector number", value: card.collectorNumber },
          { "@type": "PropertyValue", name: "Rarity", value: card.rarity },
          { "@type": "PropertyValue", name: "Domain", value: card.domain },
          { "@type": "PropertyValue", name: "Type", value: card.type },
          ...(card.energyCost != null ? [{ "@type": "PropertyValue", name: "Energy", value: String(card.energyCost) }] : []),
          ...(card.might != null ? [{ "@type": "PropertyValue", name: "Might", value: String(card.might) }] : []),
        ],
        offers: offersLd.length === 1 ? offersLd[0] : offersLd,
      }
    : null;

  const tags = (card.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);

  // Breadcrumbs: real internal links (Home → Cards → Set → Card) plus matching
  // structured data. This deepens internal linking — the single biggest lever for
  // getting the long-tail card pages crawled and indexed — and earns breadcrumb
  // rich results in Google.
  const setInfo = setInfoForLd;
  const setUrl = setInfo && !setInfo.comingSoon ? `/sets/${setInfo.slug}` : "/browse";
  // The set crumb is DROPPED when the set has no page of its own — a collector
  // product like T1S is not in SETS, so `setUrl` falls back to /browse and the
  // trail would list the same URL twice under two different names. Two crumbs
  // pointing at one URL is a malformed trail; three honest levels beat four with
  // a duplicate in them. (Only visible now that these pages are indexed — while
  // they carried noindex nothing was reading this.)
  const hasSetPage = setUrl !== "/browse";
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Cards", item: `${SITE_URL}/browse` },
      ...(hasSetPage
        ? [{ "@type": "ListItem", position: 3, name: card.setName, item: `${SITE_URL}${setUrl}` }]
        : []),
      { "@type": "ListItem", position: hasSetPage ? 4 : 3, name: card.name, item: `${SITE_URL}${cardUrl}` },
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

  // This printing's own special-print flags, and (if this IS a special printing)
  // the real tracked price of its plain base sibling — used ONLY for the
  // "is the premium printing worth it?" FAQ below. Never asserted without both a
  // real base sibling AND a real price on both sides to compare.
  const thisIsSignature = isSignature(card.collectorNumber);
  const thisIsOvernumbered = isOvernumbered(card.collectorNumber);
  const thisIsCrystalRose = isCrystalRose(card.setCode, card.collectorNumber);
  const basePrinting = printings.find(
    (p) => p.variant == null && !p.isPromo && p.rarity !== "Showcase" && !isOvernumbered(p.collectorNumber) && !isSignature(p.collectorNumber)
  );
  // THE printing this page is, resolved once and shared by the "Printing" cell,
  // the About narrative and the FAQ so all three name it identically.
  const thisPrinting = {
    isSignature: thisIsSignature,
    isCrystalRose: thisIsCrystalRose,
    isOvernumbered: thisIsOvernumbered,
    isPromo: card.isPromo,
    variant: card.variant,
  };
  const thisPrintingKind = printingKind(thisPrinting);
  const thisEdition = editionLabel({ ...thisPrinting, rarity: card.rarity });
  const basePriceCents = basePrinting ? (basePrinting[priceField(DEFAULT_COUNTRY)] as number | null) : null;

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

  // Cheaper alternatives — same set, same domain AND same type (so a unit is
  // never offered as an "alternative" to a spell), strictly priced below this
  // card's own baseline. Gated on `baseline.lowest != null` below so the section
  // never renders for an unpriced card — it would otherwise have to compare
  // against nothing. Deliberately NOT worded as "functional alternative": rules
  // similarity is a claim about gameplay this data cannot support (see
  // lib/content/card-narrative.ts's convention of asserting only what a figure
  // actually proves), so the heading says exactly what the query guarantees —
  // cheaper, same set, same domain, same card type.
  const cheaperAlternatives =
    baseline.lowest != null
      ? await prisma.card.findMany({
          where: {
            setCode: card.setCode,
            domain: card.domain,
            type: card.type,
            id: { not: card.id },
            [priceField(DEFAULT_COUNTRY)]: { lt: baseline.lowest, not: null },
          },
          orderBy: [{ [priceField(DEFAULT_COUNTRY)]: { sort: "desc" as const, nulls: "last" as const } }],
          take: 6,
          select: cardTileSelect(DEFAULT_COUNTRY),
        })
      : [];

  // "More {Champion} cards" — cross-SET topical cluster (e.g. every Jinx card across
  // Origins/Unleashed/Spiritforged). The champion is the name before the comma
  // ("Jinx, Loose Cannon" → "Jinx"); only Legend/unit cards are named that way, so
  // spells/runes (no comma) simply skip this module. One extra query, champion cards
  // only. Excludes this card's own other printings (same full name).
  // Resolved through the curated champion allowlist rather than the raw
  // split(","), so "Allay, Eager Admirer" (a creature, not a champion) links
  // nowhere instead of to a fabricated hub, and the Yi / Master Yi / Master
  // three-way name split collapses to one champion — see lib/champions.ts.
  const championEntry = championForCardName(card.name);
  const champion = championEntry?.name ?? null;
  const championCards = championEntry
    ? await prisma.card.findMany({
        where: {
          AND: [championCardWhere(championEntry), { name: { not: card.name } }, { id: { not: card.id } }],
        },
        orderBy: [{ lowestPriceCents: { sort: "desc", nulls: "last" } }, { setCode: "asc" }],
        take: 6,
        select: cardTileSelect(DEFAULT_COUNTRY),
      })
    : [];

  // Meta decks that play this card — card ↔ deck internal links (and a "what's this
  // card for?" signal for shoppers). Static seed lookup, no DB call.
  const allRelatedDecks = decksUsingCard(card.name);
  const relatedDecks = allRelatedDecks.slice(0, 6);

  // "Often played with" — co-occurrence derived from those SAME meta decks, in
  // process (no extra static lookup): count how often each other card name
  // appears across every deck that plays this one, excluding runes (a mana-base
  // choice, not a synergy) and this card itself, then resolve the top names to
  // real card rows in ONE bounded query. With only a handful of meta decks
  // seeded today (see prisma/meta-decks.json), this is correctly empty for most
  // cards — gated on allRelatedDecks.length below rather than always rendering
  // a near-empty section.
  const coPlayCounts = new Map<string, number>();
  for (const d of allRelatedDecks) {
    for (const c of d.cards) {
      if (c.section === "rune" || c.name === card.name) continue;
      coPlayCounts.set(c.name, (coPlayCounts.get(c.name) ?? 0) + 1);
    }
  }
  const coPlayNames = [...coPlayCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name]) => normalizeSearch(name));
  // A champion/legend name routinely has several printings (base, Showcase,
  // Signature, alt-art) — nameNormalized has no unique constraint, and a raw
  // `take: 12` over 12 NAMES can silently fill its budget with several PRINTS
  // of one splashy co-play champion, both showing that champion twice under a
  // section titled "played alongside" and dropping a genuinely different
  // ranked synergy card. Same dedup lib/meta-decks.ts's buildCardMap() already
  // uses (prefer base art; otherwise the first — cheapest, since results are
  // requested cheapest-first below) — matched here rather than a fresh
  // heuristic, so the two "which printing represents this name" decisions on
  // the site can't independently drift.
  const isBasePrinting = (collectorNumber: string) => !collectorNumber.includes("*") && !/\d+[a-z]/i.test(collectorNumber);
  const playedAlongsideMatches = coPlayNames.length
    ? await prisma.card.findMany({
        where: { nameNormalized: { in: coPlayNames }, id: { not: card.id } },
        orderBy: [{ [priceField(DEFAULT_COUNTRY)]: { sort: "asc" as const, nulls: "last" as const } }],
        select: cardTileSelect(DEFAULT_COUNTRY),
      })
    : [];
  const playedAlongsideByName = new Map<string, (typeof playedAlongsideMatches)[number]>();
  for (const m of playedAlongsideMatches) {
    const key = normalizeSearch(m.name);
    const existing = playedAlongsideByName.get(key);
    if (!existing || (isBasePrinting(m.collectorNumber) && !isBasePrinting(existing.collectorNumber))) {
      playedAlongsideByName.set(key, m);
    }
  }
  // Re-ordered to the co-play frequency ranking (the dedup Map above was built
  // in query order, not synergy order) — already capped to ≤12 distinct names
  // by coPlayNames itself.
  const playedAlongside = coPlayNames
    .map((n) => playedAlongsideByName.get(n))
    .filter((m): m is NonNullable<typeof m> => m != null);

  // AU price history (day-cached — see lib/price-history) reused here for the
  // genuine price-trend paragraph below. Same cache key as the chart's own fetch
  // (default take=120), so this never doubles the day's history read.
  const history = await getPriceHistory(card.id, DEFAULT_COUNTRY);

  // ── Editorial narrative ────────────────────────────────────────────────────
  // Built by lib/content/card-narrative.ts from this card's OWN market data:
  // cross-market spread, trajectory, stock depth, condition/foil economics,
  // variant premium, set position, playability. Every observation is emitted
  // only when the data supports it, and the sentence FORMS branch on data
  // conditions — so a single-seller card and a nine-seller card get genuinely
  // different paragraphs, not the same one with numbers swapped.
  //
  // This replaces a fixed sentence skeleton ("X is a common unit card from
  // Origins (OGN)… It belongs to the Fury domain") that produced ~1,400
  // near-identical pages, which is the scaled-content-abuse shape.
  const marketFor = (country: Country): NarrativeMarket => {
    const view = computeMarket(rows, country);
    const inStock = view.prices;
    const delivered = inStock.map((p) => p.delivered).sort((a, b) => a - b);
    // normaliseCondition is the ONE mapping from four incompatible marketplace
    // condition vocabularies (Shopify variant titles, eBay's raw-card scale,
    // TCGplayer/Cardmarket's blanket "NM") onto our five grades — used here
    // instead of a page-local regex so this split can't silently drift from
    // what the price table itself labels as NM (see CardMarketSection.tsx).
    // A row whose condition genuinely can't be classified lands in NEITHER
    // bucket, same as before — the narrative should not guess.
    const nm = inStock.filter((p) => normaliseCondition(p.condition) === "NM");
    const played = inStock.filter((p) => {
      const g = normaliseCondition(p.condition);
      return g != null && g !== "NM";
    });
    const min = (xs: { priceCents: number }[]) =>
      xs.length ? Math.min(...xs.map((x) => x.priceCents)) : null;
    return {
      country,
      place: COUNTRIES[country].place,
      currency: view.currency,
      lowestCents: view.lowest,
      lowestDeliveredCents: delivered[0] ?? null,
      secondCents: inStock[1]?.priceCents ?? null,
      storeCount: view.storeCount,
      listingCount: inStock.length,
      cheapestNonFoilCents: view.cheapestStandard,
      cheapestFoilCents: view.cheapestFoil,
      cheapestNearMintCents: min(nm),
      cheapestPlayedCents: min(played),
    };
  };

  // Where this card sits in its set's price distribution — one grouped query,
  // and the only input the narrative can't derive from data already on the page.
  const setPrices = await prisma.card
    .findMany({
      where: { setCode: card.setCode, [priceField(DEFAULT_COUNTRY)]: { not: null } },
      select: { [priceField(DEFAULT_COUNTRY)]: true } as Record<string, boolean>,
    })
    .then((rowsIn) => (rowsIn as unknown as Record<string, number>[]).map((r) => r[priceField(DEFAULT_COUNTRY)]).filter((n): n is number => n != null))
    .catch(() => [] as number[]);
  const sortedSetPrices = [...setPrices].sort((a, b) => a - b);
  const setContext =
    sortedSetPrices.length && baseline.lowest != null
      ? {
          pricedInSet: sortedSetPrices.length,
          cheaperThan: sortedSetPrices.filter((p) => p < baseline.lowest!).length,
          setMedianCents: sortedSetPrices[Math.floor(sortedSetPrices.length / 2)],
        }
      : null;

  const about = buildCardNarrative({
    name: card.name,
    displayName,
    setName: card.setName,
    setCode: card.setCode,
    collectorNumber: card.collectorNumber,
    rarity: card.rarity,
    type: card.type,
    domain: card.domain,
    variant: card.variant,
    isPromo: card.isPromo,
    energyCost: card.energyCost,
    might: card.might,
    power: card.power,
    isSignature: thisIsSignature,
    isOvernumbered: thisIsOvernumbered,
    isCrystalRose: thisIsCrystalRose,
    baseline: marketFor(DEFAULT_COUNTRY),
    markets: COUNTRY_LIST.map((c) => marketFor(c.code)).filter((m) => m.storeCount > 0),
    history: { points: history.map((p) => ({ t: p.t, v: p.v })) },
    printings: printings.map((p) => ({
      // cardCredentials() is the canonical code→label mapping (lib/card-name.ts).
      // Deriving this by subtracting the name out of cardDisplayName() left the
      // parentheses behind, so the narrative read "The (Alt Art) print carries…".
      label: cardCredentials(p).join(" ").toLowerCase() || "base",
      priceCents: (p[priceField(DEFAULT_COUNTRY)] as number | null) ?? null,
      isBase:
        p.variant == null && !p.isPromo && p.rarity !== "Showcase" &&
        !isOvernumbered(p.collectorNumber) && !isSignature(p.collectorNumber),
    })),
    decks: allRelatedDecks.map((d) => ({ name: d.name })),
    setContext,
  });

  // The same price-data test that drives the sitemap and the robots tag, so the
  // page can explain its own state honestly when it has nothing to compare.
  const priceState = await getCardPriceState(card);

  // Contextual links from this programmatic page into our real editorial work.
  const relatedGuides = guidesForCard({
    setName: card.setName,
    setCode: card.setCode,
    rarity: card.rarity,
    type: card.type,
    domain: card.domain,
    isPromo: card.isPromo,
    variant: card.variant,
    isSignature: thisIsSignature,
    priceCents: baseline.lowest,
    // The printed rules text, so a card that prints a keyword we hold verified
    // rules for links to THAT mechanic's guide. Matched on the bracket marker
    // only — nothing is inferred about what the keyword does.
    description: card.description,
  });
  const faqs = buildFaqs(card, {
    lowest: baseline.lowest,
    stores: baseline.storeCount,
    printingCount: printings.length,
    deckCount: allRelatedDecks.length,
    deckNames: allRelatedDecks.slice(0, 2).map((d) => d.name),
    place: baselinePlace,
    currency: baseline.currency,
    // editionLabel() is null exactly when this is the plain version, so it
    // answers "is this a special printing?" and "what do we call it?" with one
    // decision. Same helper the About narrative uses, so the two can't disagree
    // — and it prefers the PRINTING over the rarity, which is what previously
    // made an alternate-art card call itself "the Showcase printing".
    isSpecialPrinting: thisEdition != null,
    specialPrintingLabel: thisEdition ?? "",
    basePriceCents,
    noRetailChannel: priceState.noRetailChannel,
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
      <CardViewBeacon idOrSlug={card.slug ?? card.id} cardId={card.id} cardName={displayName} rarity={card.rarity} />
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-slate-400 sm:mb-4">
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

      <div className="grid gap-4 lg:gap-6 lg:grid-cols-[320px_1fr]">
        {/* Card visual. Capped much smaller on phones than desktop (was a flat
            max-w-[320px] at every breakpoint) — at 390px wide, a 320px-wide
            5:7 card image ran ~450px tall and, combined with the header stat
            card below it, pushed the price comparison table's #1 row well
            past a full mobile viewport before this pass. The image is still
            the same picture at the same aspect ratio, just smaller until the
            desktop two-column layout has room to spare. */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="card-surface mx-auto max-w-[140px] p-3 sm:max-w-[220px] sm:p-4 lg:max-w-[320px]">
            <CardImage card={card} full priority className="aspect-[5/7] w-full" />
          </div>
        </div>

        {/* Details + price comparison */}
        <div className="min-w-0">
          {/* p-4 on phones (was a flat p-5) — one more small contributor to the
              same above-the-fold budget as the smaller image above. */}
          <div className="card-surface p-4 sm:p-5">
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
            <div className="mt-2 flex items-start justify-between gap-3 sm:mt-3">
              <div>
                <h1 className="text-xl font-extrabold text-white sm:text-2xl">{displayName}</h1>
                <p className="mt-1 font-mono text-xs text-slate-500">
                  {card.setName} ({card.setCode}) · {card.collectorNumber}
                </p>
              </div>
              <PriceWatchButton cardId={card.id} variant="full" />
              <ShareButton />
            </div>

            {/* Market-localised metrics (SSR = AU baseline; client reconciles). */}
            <CardPriceMetrics rows={rows} energyCost={card.energyCost} might={card.might} power={card.power} />
          </div>

          {/* ── PRICE COMPARISON LEADS, ABOVE THE FOLD ─────────────────────────
              Reordered 2026-08 (UX audit: qualified retailer click-through
              rate). The #1 in-stock retailer row must be visible without
              scrolling — that's the whole point of a price-comparison site,
              and it used to sit below an entire "About" essay + empty-state
              fallback + Marketplace hero. Moving it up front is a REORDER, not
              a content deletion: About/FAQ/prices-by-market/the affiliate eBay
              block are all still in the DOM a little further down (rankings
              depend on content EXISTING in the DOM, not on where — see
              docs/adsense-remediation.md § Phase 8 for the original reasoning
              behind writing this page's own analysis instead of leading with
              an affiliate carousel, which still holds: our own writing is
              still well ahead of the affiliate eBay block at the very
              bottom, just after — not before — the thing most visitors
              actually came for. */}

          {/* No live market anywhere: say so plainly, then be genuinely useful —
              the other printings that ARE priced, the set and domain to browse
              instead, and a price watch. This page is noindexed while it stays in
              this state (see generateMetadata), but people still reach it from
              internal links and bookmarks, and an empty shell serves none of them. */}
          {priceState.isEmpty && (
            <section className="mt-6 rounded-xl border border-gold/25 bg-gold/[0.04] p-5">
              <h2 className="font-bold text-white">
                {priceState.noRetailChannel
                  ? `Why there's no price for ${displayName}`
                  : `No live listings for ${displayName} yet`}
              </h2>
              {/* A printing with no retail channel needs a different explanation.
                  The generic copy below promises the page "fills in the moment a
                  store lists it" — true for a card shops actually stock, and
                  misleading for one that is only ever distributed by lottery.
                  Saying so plainly is both more useful and more honest. */}
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                {priceState.noRetailChannel ? (
                  <>
                    {card.setName} is distributed by drawing on the Riot Merch Store, not through
                    shops — so none of the retailers we track in Australia, New Zealand, the United
                    States, the United Kingdom, Singapore or Canada will ever stock it at retail, and
                    there is no launch price to compare. The only market this printing can have is
                    resale. We track that too: a price appears here as soon as a copy changes hands
                    somewhere we can see it.
                  </>
                ) : (
                  <>
                    None of the stores we track in Australia, New Zealand, the United States, the
                    United Kingdom, Singapore or Canada has this printing in stock today, and we have
                    fewer than seven days of recorded price history for it — so there is nothing
                    honest to compare yet. We check every store daily; this page fills in on its own
                    the moment one lists it.
                  </>
                )}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {printings.some((p) => (p[priceField(DEFAULT_COUNTRY)] as number | null) != null) && (
                  <Link href="#other-printings" className="btn-ghost text-xs">
                    See the printings that are in stock ↓
                  </Link>
                )}
                <Link href={setUrl} className="btn-ghost text-xs">
                  Browse priced {card.setName} cards →
                </Link>
                <Link href={`/domains/${domainSlug(card.domain)}`} className="btn-ghost text-xs">
                  Priced {card.domain} cards →
                </Link>
              </div>
              <div className="mt-4">
                <PriceWatchButton cardId={card.id} variant="full" />
              </div>
            </section>
          )}

          {/* Price comparison + eBay fallback + contextual affiliate banners —
              everything that varies with the visitor's market lives in the client
              section so the route itself stays cookie-free and ISR-cacheable. An
              explicit H2 here (rather than just the component's own internal
              heading) gives this block its own crawlable section signal. */}
          <section className="mt-4 sm:mt-6">
            <h2 className="sr-only">Price history &amp; where to buy {card.name}</h2>
            <CardPriceComparison
              rows={rows}
              displayName={displayName}
              ebaySearch={ebaySearch}
              ebayQuery={`${cardSearchName(card.name, card)} ${card.collectorNumber}`}
            />

            {/* Price-history chart — free for everyone (AU history; the series is
                collected on the AU baseline market). */}
            <PriceHistoryChart cardId={card.id} />
          </section>

          {/* RiftCompare Marketplace hero — the main attention-grab, shown only
              when this card actually has active P2P listings. Moved BELOW the
              store price comparison (was above it): the store table is the
              proven, always-populated primary path, and a P2P listing (when
              one exists) is the secondary upsell beneath it, not competing
              with it for the first thing a buyer sees. */}
          <MarketplaceHeroBlock cardId={card.id} cardName={displayName} />

          {/* ── OUR OWN ANALYSIS ────────────────────────────────────────────
              Still leads over the FAQ, the prices-by-market table and — most
              importantly — the affiliate eBay block at the very bottom of the
              column, so an AdSense reviewer (or a reader) hits real, original
              writing well before any affiliate content. See docs/adsense-
              remediation.md § Phase 8. */}
          <section className="card-surface mt-6 p-5">
            <h2 className="font-bold text-white">About {card.name}</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-300">
              {about.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {card.description && (
                <p className="text-slate-400">
                  <KeywordText text={card.description} />
                </p>
              )}
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
            {/* Facet cross-links — internal-linking fix for the crawled-not-indexed
                backlog: every card page now links out to its type, rarity and domain
                hub, not just its own set/champion clusters. */}
            {/* Each chip renders ONLY where the facet page it points at actually
                exists. The type and rarity routes are generated from TYPE_FACETS
                and RARITY_FACETS, which are built from CARD_TYPES / RARITY_KEYS —
                so a card carrying a value outside those lists (a Token, today)
                linked straight to a 404. Found by scripts/content-quality.ts.
                Resolving through the same lookup the route uses means a new card
                type can never mint a dead link again, and gains its chip
                automatically the day a facet is added for it. */}
            <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-800 pt-4">
              {typeFacetBySlug(card.type.toLowerCase()) && (
                <Link href={`/cards/type/${card.type.toLowerCase()}`} className="chip bg-ink-800 text-slate-400 transition-colors hover:bg-ink-700 hover:text-slate-200">
                  More {card.type} cards →
                </Link>
              )}
              {rarityFacetBySlug(card.rarity.toLowerCase()) && (
                <Link href={`/cards/rarity/${card.rarity.toLowerCase()}`} className="chip bg-ink-800 text-slate-400 transition-colors hover:bg-ink-700 hover:text-slate-200">
                  More {card.rarity} cards →
                </Link>
              )}
              <Link href={`/domains/${domainSlug(card.domain)}`} className="chip bg-ink-800 text-slate-400 transition-colors hover:bg-ink-700 hover:text-slate-200">
                More {card.domain} cards →
              </Link>
            </div>
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

          {/* Cross-market prices — every market's listings are ALREADY on this
              page (rows carries all six, no country filter server-side; see the
              `rows` comment above), so this costs zero extra queries. Previously
              this data only ever reached the reader as prose inside the "About"
              narrative above — never a navigable, at-a-glance table. Only
              markets with an actual live listing render. */}
          {marketPrices.length > 1 && (
            <section className="card-surface mt-6 p-5">
              <h2 className="font-bold text-white">{card.name} prices by market</h2>
              <ul className="mt-3 divide-y divide-ink-800">
                {marketPrices.map(({ info, view }) => (
                  <li key={info.code} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="flex items-center gap-2 text-slate-300">
                      <span aria-hidden>{info.flag}</span>
                      {info.place}
                    </span>
                    <span className="num text-white">
                      {formatMoney(view.lowest!, view.currency)}
                      <span className="ml-1.5 text-xs text-slate-500">
                        · {view.storeCount} {view.storeCount === 1 ? "store" : "stores"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Conversion island (client → route stays ISR): watch-this-price email
              capture + a Value Finder teaser for non-members. */}
          <div className="mt-6">
            <CardConversionCta cardId={card.id} />
          </div>

          {/* AI Tips — hidden entirely while the AdSense review is open.
              It is explicitly AI-labelled, it comments on price direction, and it
              reads as quasi-financial advice: three separate things a reviewer
              marks down, on the site's highest-volume template. Restored by
              setting NEXT_PUBLIC_ADSENSE_REVIEW_MODE=false after approval.
              See docs/adsense-remediation.md § Phase 9. */}
          {!ADSENSE_REVIEW_MODE && (
            <section className="card-surface mt-6 p-5">
              <AiInsight cardId={card.id} />
            </section>
          )}

          {/* In-content ad — below the price table the visitor came for, so it never
              gets between them and the prices. Suppressed entirely on a page with
              no price data (see AdSlot: no units on noindex/thin pages). */}
          <AdSlot className="mt-6" height={120} pageIsThin={priceState.isEmpty} />

          {/* Rarity/variant summary as its own labelled section — the facts (Showcase,
              Signature, Overnumbered, Crystal Rose, Promo) already exist in the badge
              row and the About prose above; this just gives them one crawlable,
              explicitly-headed answer for "is this printing rare/special" queries. */}
          <section className="card-surface mt-6 p-5">
            <h2 className="font-bold text-white">Rarity, prints &amp; variants</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Rarity</dt>
                <dd className="text-slate-200">{card.rarity}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Printing</dt>
                {/* Same decision as the About prose above — see printingKind().
                    This cell used to be an independent ladder of ternaries, and
                    when the generator's ladder drifted (it consulted rarity),
                    the two disagreed in public: "Printing: Alternate art" here,
                    "the Showcase printing" three paragraphs up. */}
                <dd className="text-slate-200">{PRINTING_DISPLAY[thisPrintingKind]}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Set</dt>
                <dd className="text-slate-200">{card.setName} ({card.setCode})</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Other tracked printings</dt>
                <dd className="text-slate-200">{printings.length}</dd>
              </div>
            </dl>
          </section>

          {/* Tool strip — the actual "what do I do with this price" next step.
              Every one of these tools already existed; none was linked from a
              card page before. This is the highest-traffic template on the
              site (~1,400 renders), so it's also the highest-leverage place to
              route a reader toward the tools rather than dead-ending on one
              card's price. */}
          <section className="card-surface mt-6 p-5">
            <h2 className="font-bold text-white">Do more with this price</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/deck" className="chip border border-ink-700 hover:border-brand-500 hover:bg-ink-800">
                Price a whole deck →
              </Link>
              <Link href="/tools/best-basket" className="chip border border-ink-700 hover:border-brand-500 hover:bg-ink-800">
                Cheapest multi-card cart →
              </Link>
              <Link href="/bulk-pricer" className="chip border border-ink-700 hover:border-brand-500 hover:bg-ink-800">
                Bulk price a list →
              </Link>
              {setInfo && !setInfo.comingSoon && (
                <Link href={`/sealed?set=${card.setCode}`} className="chip border border-ink-700 hover:border-brand-500 hover:bg-ink-800">
                  Sealed {card.setName} products →
                </Link>
              )}
            </div>
          </section>

          {/* Into our real editorial work. On a programmatic page this is the
              shortest path a reader — or a reviewer — has to something a person
              actually wrote, and it's chosen from this card's own attributes
              rather than being the same three links on all 1,400 pages. */}
          {relatedGuides.length > 0 && (
            <section className="card-surface mt-6 p-5">
              <h2 className="font-bold text-white">Read next</h2>
              <ul className="mt-3 space-y-3">
                {relatedGuides.map((g) => (
                  <li key={g.slug}>
                    <Link
                      href={`/${g.category === "guide" ? "guides" : "blog"}/${g.slug}`}
                      className="group block"
                    >
                      <span className="block text-sm font-semibold text-brand-400 group-hover:underline">
                        {g.title}
                      </span>
                      <span className="block text-xs text-slate-500">{g.reason}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── AFFILIATE BLOCK — deliberately LAST of the in-column sections ──
              eBay carries this card in every market and pays a commission, so it
              stays; it just no longer greets the reader before anything we wrote.
              The disclosure sits with it rather than being repeated in prime
              real estate — same compliance, honest placement. */}
          <section className="card-surface mt-6 p-5">
            <h2 className="font-bold text-white">Also available on eBay</h2>
            <p className="mt-1 text-xs text-slate-500">
              Live listings including used, graded and international sellers — a useful cross-check
              on the store prices above, and often the only source for older printings.
            </p>
            {/* Listings / Graded / Auctions. Extra tabs appear only when this
                card has that kind of listing in the visitor's market, so an
                ordinary card still shows exactly the single carousel it always
                did, with no tab chrome at all. Chase cards get the full set.

                All three sit BELOW the price comparison and outside it. A slab
                and a current bid are both real, and neither is a price you can
                compare against a store — see the EbayAuction and
                EbayGradedListing model comments for what letting either into
                RetailerPrice would break. */}
            <EbayCardPanel cardId={card.id} query={cardSearchName(card.name, card)} className="mt-3" />
          </section>
        </div>
      </div>

      {/* Other printings — promo/alt-art/Signature versions of this exact card.
          Cross-links the variant cluster (each printing is its own product with its
          own price) so no printing is an unreferenced near-duplicate. */}
      {printings.length > 0 && (
        <section id="other-printings" className="mt-10 scroll-mt-24">
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

      {/* Often played with — co-occurrence from the same meta decks as "Played in
          these decks" above, resolved to actual card rows. Absent for most
          cards today (only a handful of meta decks are seeded), which is
          correct — it should not render a near-empty section. */}
      {playedAlongside.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-1 text-xl font-extrabold text-white">Often played with {displayName}</h2>
          <p className="mb-4 text-xs text-slate-500">Cards that show up in the same meta decks as this one.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {playedAlongside.map((c) => (
              <CardTile key={c.id} card={c} />
            ))}
          </div>
        </section>
      )}

      {/* Cheaper alternatives — same set, domain and card type, strictly priced
          below this card. Gated on the query itself (empty when unpriced), so
          this never asserts a comparison the data can't back. */}
      {cheaperAlternatives.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-1 text-xl font-extrabold text-white">
            Cheaper {card.domain === "Colorless" ? "" : `${card.domain} `}{card.type ? `${card.type.toLowerCase()}s` : "cards"} in {card.setName}
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Same set, same domain, same card type — priced below {fmtBaseline(baseline.lowest!)} in {baselinePlace}.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {cheaperAlternatives.map((c) => (
              <CardTile key={c.id} card={c} />
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
                Compare prices on similar Riftbound {card.setName} singles, or{" "}
                {/* Also the card catalogue's main internal link INTO the gallery:
                    ~1,000 card pages each pointing at it is the strongest crawl
                    signal available to a brand-new landing page. */}
                {setInfo && !setInfo.comingSoon ? (
                  <Link href={`/sets/${setInfo.slug}/gallery`} className="text-brand-300 underline-offset-2 hover:underline">
                    browse the full {card.setName} card gallery
                  </Link>
                ) : (
                  <Link href="/browse" className="text-brand-300 underline-offset-2 hover:underline">
                    browse the card database
                  </Link>
                )}
                .
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
      {championCards.length > 0 && championEntry && (
        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="text-xl font-extrabold text-white">More {championEntry.name} cards</h2>
            {/* Points at the champion HUB, not a /browse?q= search: the hub is
                server-rendered, self-canonical and indexable, where the search
                view is noindexed (Google discourages indexing site-search). */}
            <Link href={`/champions/${championEntry.slug}`} className="btn-ghost text-xs shrink-0">
              All {championEntry.name} cards →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {championCards.map((c) => (
              <CardTile key={c.id} card={c} />
            ))}
          </div>
        </section>
      )}

      {/* The "Embed this live price" widget button was here — removed with the rest
          of the widget feature. /embed/card/[id] still serves so existing third-party
          embeds don't break; we simply no longer offer new ones. */}
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

type FaqContext = {
  lowest: number | null;
  stores: number;
  printingCount: number;
  deckCount: number;
  deckNames: string[];
  place: string;
  currency: string;
  // Only used for the "is the premium printing worth it?" FAQ, and only when
  // this printing genuinely IS a special one — never asserted for a base card.
  isSpecialPrinting: boolean;
  specialPrintingLabel: string;
  basePriceCents: number | null;
  /**
   * This printing has no retail channel (see lib/card-price-state.ts). These
   * answers are published as FAQPage JSON-LD, so the two price/where-to-buy
   * answers below MUST branch on it: the defaults promise that stores stock the
   * card and that a price will appear, and both are false for a product Riot
   * only ever distributes by drawing. Getting this wrong is worse than the
   * noindex it replaces — it is a structured-data claim that contradicts the
   * page it sits on.
   */
  noRetailChannel: boolean;
};

function buildFaqs(card: CardForCopy, ctx: FaqContext): { q: string; a: string }[] {
  // Every question and answer leaves through tidy() at the end of this function
  // — same reasoning as the narrative's exit point.
  const { lowest, stores, printingCount, deckCount, deckNames, place, currency, isSpecialPrinting, specialPrintingLabel, basePriceCents, noRetailChannel } = ctx;
  const faqs = [
    {
      q: `How much does ${card.name} cost?`,
      a: lowest != null && stores > 0
        ? `The cheapest live price for ${card.name} (${card.setCode} ${card.collectorNumber}) is currently ${formatMoney(lowest, currency)} across ${stores} ${stores === 1 ? "store" : "stores"} in ${place}; every other market we cover is compared on this page too. Prices update daily.`
        : noRetailChannel
        ? `There is no retail price for ${card.name} (${card.setCode} ${card.collectorNumber}). ${card.setName} is distributed by drawing rather than sold through shops, so no store we track lists it — the only price it can have is a resale price, and this page shows one as soon as a copy changes hands somewhere we can see it.`
        : `We don't have a live price for ${card.name} right now. Prices refresh daily across AU, NZ, US, UK and SG stores — check back soon for the cheapest place to buy it.`,
    },
    {
      q: `What set is ${card.name} from?`,
      a: `${card.name} is card ${card.collectorNumber} from ${card.setName} (${card.setCode}) in the Riftbound TCG. It is a ${card.rarity.toLowerCase()} ${card.type.toLowerCase()}${card.domain === "Colorless" ? "" : ` in the ${card.domain} domain`}.`,
    },
    {
      q: `Where can I buy ${card.name}?`,
      a: noRetailChannel
        ? `Not from a shop. ${card.name} comes only in ${card.setName}, which Riot distributes through a Riot Merch Store drawing rather than retail, so there is no storefront to compare. Copies reach the open market only when someone who won the drawing resells one — this page tracks that market and will show a price when it appears.`
        : `Compare every store selling ${card.name} across Australia, New Zealand, the US, the UK, Singapore and Canada on this page, then buy from whichever retailer offers the lowest total price including postage. RiftCompare links straight through to each store.`,
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

  // "Is the premium printing worth it?" — only asked when this page genuinely IS
  // a special printing, and only answered with a real number when a real,
  // currently-priced base sibling exists to compare against. Never a made-up
  // "yes it's worth it" — the answer is the honest price gap, or an admission
  // that there isn't enough data yet.
  if (isSpecialPrinting) {
    const a =
      lowest != null && basePriceCents != null
        ? `The ${specialPrintingLabel} printing of ${card.name} is currently ${formatMoney(lowest, currency)} in ${place}, versus ${formatMoney(basePriceCents, currency)} for the base printing — a ${
            lowest > basePriceCents
              ? `${formatMoney(lowest - basePriceCents, currency)} premium`
              : lowest < basePriceCents
              ? `${formatMoney(basePriceCents - lowest, currency)} discount`
              : "no premium right now"
          }. Whether that gap is "worth it" comes down to whether you want the base card to play with or the ${specialPrintingLabel.toLowerCase()} print to collect — both are tracked separately on RiftCompare.`
        : `We don't have live prices for both the ${specialPrintingLabel} printing and the base printing of ${card.name} right now, so there's no honest price gap to compare yet — check back once both are tracked.`;
    faqs.push({ q: `Is the ${specialPrintingLabel} printing of ${card.name} worth it?`, a });
  }

  return faqs.map((f) => ({ q: tidy(f.q), a: tidy(f.a) }));
}
