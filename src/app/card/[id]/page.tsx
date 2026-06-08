import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CardImage } from "@/components/CardImage";
import { DomainBadge, RarityBadge, VariantBadge, OvernumberedBadge, PromoBadge, SignatureBadge } from "@/components/Badge";
import { isOvernumbered, isSignature } from "@/lib/constants";
import { WishlistButton } from "@/components/WishlistButton";
import { CardViewBeacon } from "@/components/CardViewBeacon";
import { formatMoney, timeAgo } from "@/lib/format";
import { effectiveShippingCents, shippingPolicyUrl } from "@/lib/retailers";
import { affiliateUrl, SOVRN_VERIFY_CARD_SLUG, SOVRN_VERIFY_RETAILER, SOVRN_VERIFY_URL } from "@/lib/affiliate";
import { cardDisplayName } from "@/lib/card-name";
import { OutboundLink } from "@/components/OutboundLink";
import { AdSlot } from "@/components/AdSlot";
import { ADSENSE_SLOTS } from "@/lib/ads";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES, pickPrice } from "@/lib/country";
import { UK_FALLBACK_RETAILERS, setByCode } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";

// ISR while AU-only; dynamic per-request once NZ mode is enabled (cookie-driven).
export const revalidate = 180;

// Accept either the slug ("vayne-hunter-sfd-223-221") or the legacy cuid.
const whereParam = (p: string) => ({ OR: [{ slug: p }, { id: p }] });

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const country = getCountry();
  const info = COUNTRIES[country];
  const card = await prisma.card.findFirst({
    where: whereParam(params.id),
    select: { slug: true, name: true, setName: true, setCode: true, collectorNumber: true, lowestPriceCents: true, lowestPriceCentsNz: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true, imageUrl: true, imageThumbUrl: true },
  });
  if (!card) return { title: "Card not found" };

  const lowest = pickPrice(card, country);
  const price = lowest != null ? ` from ${formatMoney(lowest, info.currency)}` : "";
  const title = `${card.name} (${card.setCode} ${card.collectorNumber}) — Riftbound price in ${info.place}`;
  const description = `Compare live ${info.adjective} prices for ${card.name}, Riftbound ${card.setName} ${card.collectorNumber}${price}. Find the cheapest store to buy this card in ${info.place}.`;
  const image = card.imageUrl ?? card.imageThumbUrl ?? undefined;

  return {
    title,
    description,
    alternates: { canonical: `/card/${card.slug ?? params.id}` },
    openGraph: {
      title,
      description,
      type: "website",
      images: image ? [{ url: image }] : undefined,
    },
  };
}

export default async function CardPage({ params }: { params: { id: string } }) {
  const country = getCountry();
  const info = COUNTRIES[country];
  const fmt = (cents: number) => formatMoney(cents, info.currency);
  const card = await prisma.card.findFirst({
    where: whereParam(params.id),
    include: {
      // Only the selected market's store listings (AU stores + eBay AU, or NZ stores).
      retailerPrices: { where: { country }, orderBy: { priceCents: "asc" } },
    },
  });

  if (!card) notFound();

  const lowestPrice = pickPrice(card, country);

  // Rank by ITEM price — the "lowest price" is the cheapest card price, full stop.
  // Postage is shown for transparency when we genuinely know it (eBay's real
  // per-listing figure), but it must NOT decide which listing is cheapest (otherwise
  // a store would be penalised vs eBay just because eBay's postage is known and a
  // store's is "at checkout"). Cheaper known postage only breaks ties on equal price.
  // Converted UK reference prices (TCGplayer-UK / Cardmarket) are fallbacks only: hide
  // them from the listing breakdown whenever a real GBP listing exists, so the cheapest
  // shown matches the "from" price (which already excludes them). When a fallback is the
  // only UK source, keep it.
  const ukHasRealGbp =
    country === "UK" &&
    card.retailerPrices.some((p) => p.inStock && !UK_FALLBACK_RETAILERS.includes(p.retailer));
  const sourceRows = ukHasRealGbp
    ? card.retailerPrices.filter((p) => !UK_FALLBACK_RETAILERS.includes(p.retailer))
    : card.retailerPrices;
  const all = sourceRows
    .map((p) => {
      const ship = effectiveShippingCents(p.shippingCents); // number | null (null = unknown)
      return { ...p, ship, delivered: p.priceCents + (ship ?? 0) };
    })
    .sort((a, b) => a.priceCents - b.priceCents || a.delivered - b.delivered);
  const prices = all.filter((p) => p.inStock);
  const outOfStock = all.filter((p) => !p.inStock);

  // Riftbound cards come in both standard and FOIL finishes (same collector number,
  // different price). Surface the cheapest of each so foil buyers/collectors can
  // compare — they were previously indistinguishable in the list.
  const minPrice = (rows: typeof prices) =>
    rows.reduce<number | null>((m, p) => (m == null || p.priceCents < m ? p.priceCents : m), null);
  const cheapestStandard = minPrice(prices.filter((p) => !p.isFoil));
  const cheapestFoil = minPrice(prices.filter((p) => p.isFoil));

  // Structured data so Google can show a rich price snippet ("$X, N stores").
  // Google requires a Product to carry "offers", "review", or "aggregateRating";
  // a Product without any of these is a critical Search Console error. So we only
  // emit the Product markup when we actually have priced, in-stock offers to back
  // it — unpriced cards simply omit it rather than emit an invalid empty Product.
  const hasOffers = prices.length > 0 && lowestPrice != null;
  const jsonLd = hasOffers
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: card.name,
        category: "Trading Card",
        description: `${card.name} — Riftbound ${card.setName} (${card.setCode}) ${card.collectorNumber}. Compare ${info.adjective} prices.`,
        ...(card.imageUrl ? { image: card.imageUrl } : {}),
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: info.currency,
          lowPrice: (lowestPrice / 100).toFixed(2),
          highPrice: (prices[prices.length - 1].priceCents / 100).toFixed(2),
          offerCount: prices.length,
          availability: "https://schema.org/InStock",
        },
      }
    : null;

  // Unique editorial copy + FAQ so each card page carries substantive, crawlable
  // text rather than just a price table (thin content ranks poorly). Everything
  // below is generated from this card's own attributes, so no two pages match.
  // Outbound "buy" URL for a retailer row. Normally our affiliate-tagged link, but
  // for the Sovrn account-verification card the Plenty of Games listing routes
  // through Sovrn's monetised URL instead (replacing that one store link in place).
  const buyHref = (p: { url: string; retailer: string }) =>
    card.slug === SOVRN_VERIFY_CARD_SLUG && p.retailer === SOVRN_VERIFY_RETAILER
      ? SOVRN_VERIFY_URL
      : affiliateUrl(p.url, p.retailer);

  const tags = (card.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const about = buildAbout(card, info, lowestPrice, prices.length, fmt);
  const faqs = buildFaqs(card, info, lowestPrice, prices.length, fmt);
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
            <CardImage card={card} full className="aspect-[5/7] w-full" />
          </div>
        </div>

        {/* Details + price comparison */}
        <div className="min-w-0">
          <div className="card-surface p-5">
            <div className="flex flex-wrap items-center gap-2">
              <DomainBadge domain={card.domain} />
              <RarityBadge rarity={card.rarity} />
              <span className="chip bg-ink-800 text-slate-300">{card.type}</span>
              <VariantBadge variant={card.variant} />
              <SignatureBadge show={isSignature(card.collectorNumber)} />
              <OvernumberedBadge show={isOvernumbered(card.collectorNumber)} />
              <PromoBadge show={card.isPromo} />
            </div>
            <div className="mt-3 flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-extrabold text-white">{cardDisplayName(card.name, card)}</h1>
                <p className="mt-1 font-mono text-xs text-slate-500">
                  {card.setName} ({card.setCode}) · {card.collectorNumber}
                </p>
              </div>
              <WishlistButton cardId={card.id} variant="full" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label={cheapestFoil != null ? "Standard from" : "Cheapest price"} value={(cheapestStandard ?? lowestPrice) != null ? fmt((cheapestStandard ?? lowestPrice)!) : "—"} highlight />
              {cheapestFoil != null && <Metric label="✦ Foil from" value={fmt(cheapestFoil)} highlight />}
              <Metric label="In stock at" value={`${prices.length} ${prices.length === 1 ? "store" : "stores"}`} />
              {card.energyCost != null && <Metric label="Energy" value={String(card.energyCost)} />}
              {card.might != null && cheapestFoil == null && <Metric label="Might" value={String(card.might)} />}
              {card.might == null && card.power != null && cheapestFoil == null && <Metric label="Power" value={String(card.power)} />}
            </div>
          </div>

          {/* Price comparison */}
          <div className="card-surface mt-6 overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-700 p-4">
              <h2 className="font-bold text-white">
                Price comparison <span className="text-slate-500">({prices.length})</span>
              </h2>
              {prices[0] && (
                <span className="text-xs text-slate-500">updated {timeAgo(prices[0].lastSeen)}</span>
              )}
            </div>

            {prices.length === 0 && outOfStock.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                <p className="font-semibold text-white">No prices found yet</p>
                <p className="mt-1">
                  We haven&apos;t matched this card to a store listing. Check back soon —
                  our price feeds refresh regularly.
                </p>
              </div>
            ) : prices.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">
                <p className="font-semibold text-white">Currently sold out everywhere</p>
                <p className="mt-1">
                  {outOfStock.length} {info.adjective} {outOfStock.length === 1 ? "store has" : "stores have"} listed
                  this card but it&apos;s out of stock right now. See them below.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-ink-800">
                {prices.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3 p-4 hover:bg-ink-900/50">
                    <div className="w-6 text-center text-sm font-bold text-slate-500">{i + 1}</div>
                    <div className="flex-1">
                      <div className="font-semibold text-white">{p.retailerName}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {p.isFoil && <span className="chip bg-gold/15 font-semibold text-gold">✦ Foil</span>}
                        {p.condition && <span className="chip bg-ink-800 text-slate-300">{p.condition}</span>}
                        <span className="text-brand-400">● In stock</span>
                        <span>
                          {p.ship == null ? "postage at checkout" : p.ship === 0 ? "free postage" : `+ ${fmt(p.ship)} postage`}
                        </span>
                        {p.ship == null && shippingPolicyUrl(p.retailer) && (
                          <a
                            href={shippingPolicyUrl(p.retailer)!}
                            target="_blank"
                            rel="nofollow noopener noreferrer"
                            className="text-slate-400 underline decoration-dotted underline-offset-2 hover:text-slate-200"
                          >
                            shipping policy ↗
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${i === 0 ? "text-accent" : "text-white"}`}>
                        {fmt(p.priceCents)}
                      </div>
                      {p.ship != null && (
                        <div className="text-[11px] text-slate-400">≈ {fmt(p.delivered)} delivered</div>
                      )}
                    </div>
                    <OutboundLink
                      href={buyHref(p)}
                      retailer={p.retailer}
                      country={country}
                      className="btn-primary"
                    >
                      View →
                    </OutboundLink>
                  </li>
                ))}
              </ul>
            )}

            {outOfStock.length > 0 && (
              <div className="border-t border-ink-800">
                <div className="bg-ink-900/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Out of stock ({outOfStock.length}) · last listed price
                </div>
                <ul className="divide-y divide-ink-800">
                  {outOfStock.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 p-4 opacity-60">
                      <div className="w-6 text-center text-slate-600">—</div>
                      <div className="flex-1">
                        <div className="font-semibold text-slate-300">{p.retailerName}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          {p.condition && <span className="chip bg-ink-800 text-slate-400">{p.condition}</span>}
                          <span className="text-slate-500">● Out of stock</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-slate-400 line-through">{fmt(p.priceCents)}</div>
                      </div>
                      <OutboundLink
                        href={buyHref(p)}
                        retailer={p.retailer}
                        country={country}
                        className="btn-ghost"
                      >
                        Check →
                      </OutboundLink>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="border-t border-ink-800 p-3 text-center text-[11px] text-slate-600">
              Prices are collected from public store listings and may change. RiftCompare
              may earn a commission on some outbound links.
            </p>
          </div>

          {/* Early-access price-history chart (Shard perk). Renders a locked teaser
              for non-owners, promoting the loyalty system on every card page. */}
          <PriceHistoryChart cardId={card.id} />

          {/* In-content ad — below the price table the visitor came for, so it never
              gets between them and the prices. Activates when a slot id is set. */}
          <AdSlot slot={ADSENSE_SLOTS.card} className="mt-6" height={120} />

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
type Info = { adjective: string; place: string };
type Fmt = (cents: number) => string;

// Builds 2 short paragraphs of unique prose from the card's own attributes.
function buildAbout(card: CardForCopy, info: Info, lowest: number | null, stores: number, fmt: Fmt): string[] {
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
  if (card.variant) p1 += ` This listing covers the alternate-art (${card.variant}) printing.`;
  if (card.isPromo) p1 += " It is a promotional printing.";

  const p2 = lowest != null && stores > 0
    ? `The lowest ${info.adjective} price for ${card.name} today is ${fmt(lowest)}, available across ${stores} ${stores === 1 ? "store" : "stores"}. RiftCompare checks ${info.adjective} retailers daily so you always see the cheapest place to buy it in ${info.place}, postage included.`
    : `We're currently tracking down ${info.adjective} listings for ${card.name}. Prices refresh daily, so check back soon or add it to your wishlist to be ready the moment it's back in stock.`;

  return [p1, p2];
}

function buildFaqs(card: CardForCopy, info: Info, lowest: number | null, stores: number, fmt: Fmt): { q: string; a: string }[] {
  return [
    {
      q: `How much does ${card.name} cost in ${info.place}?`,
      a: lowest != null && stores > 0
        ? `The cheapest ${info.adjective} price for ${card.name} (${card.setCode} ${card.collectorNumber}) is currently ${fmt(lowest)}, found across ${stores} ${stores === 1 ? "store" : "stores"}. Prices update daily.`
        : `We don't have a live ${info.adjective} price for ${card.name} right now. Prices refresh daily — check back soon for the cheapest place to buy it.`,
    },
    {
      q: `What set is ${card.name} from?`,
      a: `${card.name} is card ${card.collectorNumber} from ${card.setName} (${card.setCode}) in the Riftbound TCG. It is a ${card.rarity.toLowerCase()} ${card.type.toLowerCase()}${card.domain === "Colorless" ? "" : ` in the ${card.domain} domain`}.`,
    },
    {
      q: `Where can I buy ${card.name}?`,
      a: `Compare every ${info.adjective} store selling ${card.name} on this page, then buy from whichever retailer offers the lowest total price including postage. RiftCompare links straight through to each store.`,
    },
  ];
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-ink-900 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${highlight ? "text-accent" : "text-white"}`}>{value}</div>
    </div>
  );
}
