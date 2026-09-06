import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { SITE_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES, COUNTRY_LIST } from "@/lib/country";
import { META_UPDATED } from "@/lib/meta-decks";
import { loadDeckGroup } from "@/lib/deck-group-data";
import { DeckGroupView } from "@/components/DeckGroupView";
import {
  DOMAIN_DECK_GROUPS,
  deckGroupBySlug,
  deckGroupDescription,
  deckGroupIsIndexable,
  deckGroupPath,
  deckGroupTitle,
  seedsInGroup,
} from "@/lib/deck-groups";
import { deckGroupFaq, deckGroupFaqLd, deckGroupItemListLd, type CheapestCart } from "@/lib/deck-group-jsonld";

// Programmatic domain deck pages: /decks/domain/chaos, .../fury, …
//
// DELIBERATELY NOT A DUPLICATE OF /domains/<slug>. That page is the CARD facet
// ("every Riftbound Fury card, priced"); this one is the DECK question ("which
// meta decks play Fury, and what do they cost to build"). Different intent,
// different content, different title — and they cross-link, so the pair
// reinforces rather than competes. tests/deck-groups.test.ts asserts the titles
// stay distinct, because letting them converge is the easy mistake here.
export const revalidate = 86400;

export function generateStaticParams() {
  // Colorless has no meta deck of its own today, so it is not prerendered and
  // 404s — a page that exists only to say "no lists" is the thin page this whole
  // surface is designed not to ship. It appears on its own the day a list runs it.
  return DOMAIN_DECK_GROUPS.filter((g) => seedsInGroup(g).length > 0).map((g) => ({ slug: g.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const group = deckGroupBySlug("domain", params.slug);
  if (!group || seedsInGroup(group).length === 0) return notFoundMetadata("Domain");
  const title = deckGroupTitle(group);
  const description = deckGroupDescription(group);
  const path = deckGroupPath(group);
  return {
    title,
    description,
    alternates: pageAlternates(path),
    ...(deckGroupIsIndexable(group) ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      ...pageOpenGraph({ title, description, url: path }),
      locale: "en_US",
      alternateLocale: COUNTRY_LIST.map((c) => c.locale.replace("-", "_")).filter((l) => l !== "en_US"),
    },
  };
}

export default async function DomainDecksPage({ params }: { params: { slug: string } }) {
  const group = deckGroupBySlug("domain", params.slug);
  if (!group || seedsInGroup(group).length === 0) notFound();

  const country = getCountry();
  const info = COUNTRIES[country];
  const { decks, cartDeck, cartPlan } = await loadDeckGroup(group, country);

  const ldOpts = { siteUrl: SITE_URL, setLabel: "Vendetta", metaUpdated: META_UPDATED, info };
  const cart: CheapestCart | null =
    cartPlan && cartDeck
      ? {
          deckName: cartDeck.name,
          deckSlug: cartDeck.slug,
          totalCents: cartPlan.totalCents,
          storeCount: cartPlan.storeCount,
          topStoreName: cartPlan.stores[0]?.name ?? "",
          matchedCards: cartPlan.matchedCards,
          savedCents: cartPlan.savedCents,
        }
      : null;

  const faqs = deckGroupFaq(group, decks, ldOpts, cart);
  const nodes = [deckGroupItemListLd(group, decks, ldOpts), deckGroupFaqLd(group, decks, ldOpts, cart)].filter(Boolean);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(nodes) }} />
      <DeckGroupView
        group={group}
        decks={decks}
        cartPlan={cartPlan}
        cartDeck={cartDeck}
        faqs={faqs}
        country={country}
      />
    </>
  );
}
