// Domain landing-page content. Riftbound cards belong to one of six domains (plus
// neutral "Colorless"); until now domains were only a query-param filter on /browse,
// with no indexable hub page. These pages give each domain a real URL that links out
// to every card in it — strong internal linking + topical authority for searches like
// "Riftbound Fury cards".
import { DOMAINS, DOMAIN_KEYS, type DomainKey } from "./constants";

export interface DomainPage {
  key: DomainKey;
  label: string;
  slug: string;
  color: string;
  // One-line identity, used on chips and the index hub.
  tagline: string;
  // Two-sentence intro for the landing page — themed identity + the price-comparison
  // value prop. Kept hedged ("themed around") so we don't assert specific game rules.
  lore: string;
}

const CONTENT: Record<DomainKey, { tagline: string; lore: string }> = {
  Fury: {
    tagline: "Aggression & burst",
    lore: "Fury is the domain of raw aggression in Riftbound: League of Legends TCG — fast units and direct damage built to close games quickly. This page tracks live prices for every Riftbound Fury card across stores, so you can find the cheapest singles to build an aggressive deck.",
  },
  Calm: {
    tagline: "Growth & resilience",
    lore: "Calm is Riftbound's domain of growth and resilience, leaning on steady value and the natural order. Compare live prices for every Riftbound Calm card across stores and find the cheapest singles for a patient, value-driven deck.",
  },
  Mind: {
    tagline: "Control & knowledge",
    lore: "Mind is the domain of knowledge and control in Riftbound — card advantage, tempo and outthinking your opponent. Track live prices for every Riftbound Mind card and grab the cheapest singles for a cerebral, control-leaning build.",
  },
  Body: {
    tagline: "Endurance & power",
    lore: "Body is Riftbound's domain of endurance and physical power, built around durable units and relentless combat. Compare live prices for every Riftbound Body card across stores to find the cheapest singles for a resilient, midrange deck.",
  },
  Chaos: {
    tagline: "Disruption & risk",
    lore: "Chaos is the domain of disruption and unpredictability in Riftbound, trading stability for high-risk, high-reward plays. See live prices for every Riftbound Chaos card and find the cheapest singles to fuel a disruptive deck.",
  },
  Order: {
    tagline: "Structure & protection",
    lore: "Order is Riftbound's domain of structure and protection, rewarding disciplined, defensive play and strong support. Compare live prices for every Riftbound Order card across stores to find the cheapest singles for a controlled, protective build.",
  },
  Colorless: {
    tagline: "Neutral staples",
    lore: "Colorless cards have no domain allegiance and slot into any Riftbound deck — neutral pieces that support every strategy. Compare live prices for every Riftbound Colorless card and find the cheapest staples for any build.",
  },
};

export const DOMAIN_PAGES: DomainPage[] = DOMAIN_KEYS.map((k) => ({
  key: k,
  label: DOMAINS[k].label,
  slug: k.toLowerCase(),
  color: DOMAINS[k].color,
  ...CONTENT[k],
}));

// Slug used in the /domains/<slug> URL (lowercased domain key).
export const domainSlug = (key: string): string => key.toLowerCase();

export const domainBySlug = (slug: string): DomainPage | undefined =>
  DOMAIN_PAGES.find((d) => d.slug === slug.toLowerCase());
