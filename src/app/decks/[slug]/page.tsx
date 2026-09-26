import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PublishedDeckView, type DeckViewLine, type BestStore, type CheapestPrinting } from "@/components/decks/PublishedDeckView";
import { COUNTRY_LIST, pickPrice, type Country } from "@/lib/country";
import { computeMarket, type MarketRow } from "@/lib/market-rows";
import { effectiveShippingCents } from "@/lib/retailers";
import { affiliateUrl } from "@/lib/affiliate";
import { SITE_URL } from "@/lib/site";
import { formatMoney } from "@/lib/format";
import { ldJson } from "@/lib/jsonld";
import { cardHref } from "@/lib/card-url";
import { championForCardName } from "@/lib/champions";
import { deckTotals, massEntry, type MarketTotals } from "@/lib/published-decks";

// A published deck (2026-09-26). ISR, an hour; nothing is prerendered at build
// (no generateStaticParams — CLAUDE.md), and publishing/hiding revalidates it.
export const revalidate = 3600;

// Returns NOTHING, deliberately — the same device as /card/[id]: an (empty)
// generateStaticParams is what makes Next cache each on-demand render for
// `revalidate` (ISR) instead of rendering every request. It prerenders no page
// at build, so it adds no build-time database load (CLAUDE.md).
export async function generateStaticParams() {
  return [];
}

const getDeck = cache((slug: string) =>
  prisma.publishedDeck.findFirst({ where: { slug, status: "live" } }).catch(() => null),
);

const PRICES = {
  lowestPriceCents: true,
  lowestPriceCentsUs: true,
  lowestPriceCentsUk: true,
  lowestPriceCentsSg: true,
  lowestPriceCentsCa: true,
  lowestPriceCentsEu: true,
} as const;

const getDeckCards = cache(async (ids: string[]) =>
  prisma.card.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true, name: true, setCode: true, collectorNumber: true, variant: true, isPromo: true, type: true, ...PRICES },
  }),
);

function champion(legendName: string): string {
  return championForCardName(legendName)?.name ?? legendName.split(",")[0];
}

function base64(text: string): string {
  // The same bytes DeckBuilder's btoa(unescape(encodeURIComponent(text))) makes.
  return Buffer.from(text, "utf8").toString("base64");
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const deck = await getDeck(params.slug);
  if (!deck) return { title: "Deck not found", robots: { index: false } };
  const lines = (deck.lines as { cardId: string; qty: number }[]) ?? [];
  const cards = await getDeckCards(lines.map((l) => l.cardId));
  const byId = new Map(cards.map((c) => [c.id, c]));
  const us = deckTotals(lines.map((l) => ({ qty: l.qty, card: byId.get(l.cardId) }))).US ?? null;
  const cost = us != null ? formatMoney(us, "USD") : null;
  const title = `${champion(deck.legendName)} deck — ${cost ? `${cost} to build` : deck.title} | RiftCompare`;
  const description = `${deck.title}: a ${deck.cardCount}-card ${deck.legendName} deck${
    deck.authorName ? ` by ${deck.authorName}` : ""
  }, priced card by card at the cheapest store in your market${cost ? ` — ${cost} in the US today` : ""}.`;
  const img = `${SITE_URL}/api/og?t=${encodeURIComponent(`${champion(deck.legendName).toUpperCase()} DECK`)}&s=${encodeURIComponent(
    cost ?? `${deck.cardCount} cards`,
  )}&l=${encodeURIComponent(cost ? "to build" : "")}&b=${encodeURIComponent(deck.title)}&c=${encodeURIComponent("#f5a524")}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${SITE_URL}/decks/${deck.slug}` },
    openGraph: { title, description, url: `${SITE_URL}/decks/${deck.slug}`, images: [{ url: img, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [img] },
  };
}

export default async function DeckPage({ params }: { params: { slug: string } }) {
  const deck = await getDeck(params.slug);
  if (!deck) notFound();
  const lines = (deck.lines as { cardId: string; qty: number }[]) ?? [];
  const ids = lines.map((l) => l.cardId);
  const cards = await getDeckCards(ids);
  const byId = new Map(cards.map((c) => [c.id, c]));

  // Every printing of every card name, for the client-side "Budget build".
  const printings = await prisma.card.findMany({
    where: { name: { in: [...new Set(cards.map((c) => c.name))] } },
    select: { id: true, slug: true, name: true, setCode: true, collectorNumber: true, ...PRICES },
    take: 600,
  });

  // The cheapest store per card and market — computeMarket(), the card page's
  // own cheapest-price function, over each card's in-stock listings.
  const listings = await prisma.retailerPrice.findMany({
    where: { cardId: { in: ids }, inStock: true },
    select: {
      id: true, cardId: true, country: true, retailer: true, retailerName: true, priceCents: true,
      shippingCents: true, condition: true, isFoil: true, inStock: true, lastSeen: true, url: true,
    },
    take: 5000,
  });
  const rowsByCard = new Map<string, MarketRow[]>();
  for (const p of listings) {
    const arr = rowsByCard.get(p.cardId) ?? [];
    arr.push({
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
      buyHref: affiliateUrl(p.url, p.retailer, `${SITE_URL}/decks/${deck.slug}`),
      policyUrl: null,
    });
    rowsByCard.set(p.cardId, arr);
  }

  const viewLines: DeckViewLine[] = lines
    .map((l): DeckViewLine | null => {
      const c = byId.get(l.cardId);
      if (!c) return null;
      const best: Partial<Record<Country, BestStore | null>> = {};
      const cheapest: Partial<Record<Country, CheapestPrinting | null>> = {};
      for (const { code } of COUNTRY_LIST) {
        const top = computeMarket(rowsByCard.get(c.id) ?? [], code).prices[0];
        best[code] = top ? { retailer: top.retailer, retailerName: top.retailerName, priceCents: top.priceCents, buyHref: top.buyHref } : null;
        let pick: CheapestPrinting | null = null;
        for (const p of printings) {
          if (p.name !== c.name) continue;
          const v = pickPrice(p, code);
          if (v != null && (!pick || v < pick.priceCents)) pick = { id: p.id, href: cardHref(p), setCode: p.setCode, collectorNumber: p.collectorNumber, priceCents: v };
        }
        cheapest[code] = pick;
      }
      return {
        qty: l.qty,
        card: {
          id: c.id, href: cardHref(c), name: c.name, setCode: c.setCode, collectorNumber: c.collectorNumber, type: c.type,
          lowestPriceCents: c.lowestPriceCents, lowestPriceCentsUs: c.lowestPriceCentsUs, lowestPriceCentsUk: c.lowestPriceCentsUk,
          lowestPriceCentsSg: c.lowestPriceCentsSg, lowestPriceCentsCa: c.lowestPriceCentsCa, lowestPriceCentsEu: c.lowestPriceCentsEu,
        },
        best,
        cheapest,
      };
    })
    .filter((x): x is DeckViewLine => x != null);

  const listText = deck.list;
  const ld = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: deck.title,
    headline: `${champion(deck.legendName)} deck — ${deck.title}`,
    url: `${SITE_URL}/decks/${deck.slug}`,
    datePublished: deck.createdAt.toISOString(),
    ...(deck.authorName ? { author: { "@type": "Person", name: deck.authorName } } : {}),
    about: { "@type": "Thing", name: deck.legendName, url: `${SITE_URL}${cardHref({ id: deck.legendCardId, slug: byId.get(deck.legendCardId)?.slug ?? null })}` },
    hasPart: {
      "@type": "ItemList",
      numberOfItems: viewLines.length,
      itemListElement: viewLines.map((l, i) => ({ "@type": "ListItem", position: i + 1, name: `${l.qty} ${l.card.name}`, url: `${SITE_URL}${l.card.href}` })),
    },
  };

  return (
    <div>
      <Breadcrumbs
        trail={[
          { name: "Decks", href: "/decks" },
          { name: `${champion(deck.legendName)} decks`, href: `/decks/legend/${deck.legendSlug}` },
          { name: deck.title, href: `/decks/${deck.slug}` },
        ]}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(ld) }} />
      <PublishedDeckView
        title={deck.title}
        legendName={deck.legendName}
        legendSlug={deck.legendSlug}
        authorName={deck.authorName}
        description={deck.description}
        domains={deck.domains ? deck.domains.split(",") : []}
        publishedAt={deck.createdAt.toISOString()}
        cardCount={deck.cardCount}
        lines={viewLines}
        publishedTotals={(deck.publishedTotals as MarketTotals) ?? {}}
        massEntry={massEntry(viewLines.map((l) => ({ qty: l.qty, name: l.card.name })))}
        basketHref={`/tools/best-basket?list=${encodeURIComponent(base64(listText))}`}
        builderHref={`/deck?list=${encodeURIComponent(base64(listText))}`}
      />
    </div>
  );
}
