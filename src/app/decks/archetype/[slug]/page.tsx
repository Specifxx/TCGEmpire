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
  ARCHETYPE_GROUPS,
  deckGroupBySlug,
  deckGroupDescription,
  deckGroupIsIndexable,
  deckGroupPath,
  deckGroupTitle,
  seedsInGroup,
} from "@/lib/deck-groups";
import { deckGroupFaq, deckGroupFaqLd, deckGroupItemListLd, type CheapestCart } from "@/lib/deck-group-jsonld";

// Programmatic archetype landing pages: /decks/archetype/aggro, .../tempo, …
//
// One page per archetype family that REAL tournament lists actually carry (see
// lib/deck-groups.ts for why the allowlist can't drift), answering the plural
// query — "riftbound aggro deck" — with the thing a deck site can't: what that
// shelf of decks costs today and which cart is cheapest right now.
export const revalidate = 86400;

export function generateStaticParams() {
  // Every group with at least one real deck. A group with none 404s below and is
  // deliberately not prerendered.
  return ARCHETYPE_GROUPS.filter((g) => seedsInGroup(g).length > 0).map((g) => ({ slug: g.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const group = deckGroupBySlug("archetype", params.slug);
  if (!group || seedsInGroup(group).length === 0) return notFoundMetadata("Archetype");
  const title = deckGroupTitle(group);
  const description = deckGroupDescription(group);
  const path = deckGroupPath(group);
  return {
    title,
    description,
    alternates: pageAlternates(path),
    // A group with a single real list is genuine but can't honestly answer the
    // plural query its URL promises, so it stays crawlable and linked while
    // being kept out of the index — the same treatment thin champion hubs and
    // thin facets already get. Decided from the static seed list, so this and
    // the sitemap read the identical predicate and can never contradict.
    ...(deckGroupIsIndexable(group) ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      ...pageOpenGraph({ title, description, url: path }),
      locale: "en_US",
      alternateLocale: COUNTRY_LIST.map((c) => c.locale.replace("-", "_")).filter((l) => l !== "en_US"),
    },
  };
}

export default async function ArchetypeDecksPage({ params }: { params: { slug: string } }) {
  const group = deckGroupBySlug("archetype", params.slug);
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

  // One array, rendered visibly by DeckGroupView AND marked up here — Google
  // honours FAQPage only when the same Q&A is on the page.
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
