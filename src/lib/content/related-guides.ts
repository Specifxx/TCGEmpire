import { getArticles, type Article } from "@/lib/articles";

// ─────────────────────────────────────────────────────────────────────────────
// Card → editorial: which of our ~64 guides and posts are relevant to THIS card.
// ─────────────────────────────────────────────────────────────────────────────
// Two jobs at once.
//
// For readers: a Vendetta card should link to the Vendetta buying guide, a
// Signature print to the piece on rarity, an expensive card to the storage and
// protection guide. That is a genuinely better page.
//
// For a reviewer: it is the shortest path from a programmatic page to a piece of
// real, human-written work. An AdSense reviewer who samples /card/* URLs and
// finds only price tables concludes the site is a feed with a skin on it. One
// who finds "Read our guide to Riftbound card rarity" on every card page, and
// follows it to 800 words of original writing, does not. Anonymous programmatic
// pages with nothing linking out to editorial is precisely the shape that reads
// as machine-generated at scale.
//
// Matching is over the articles' own declared tags and titles — no hand-curated
// per-card mapping to rot, and a new guide starts appearing on relevant card
// pages the moment its tags say it should.

export type CardForGuides = {
  setName: string;
  setCode: string;
  rarity: string;
  type: string;
  domain: string;
  isPromo: boolean;
  variant: string | null;
  isSignature: boolean;
  priceCents: number | null;
  currencyIsMinorUnits?: boolean;
};

type Rule = {
  /** Does this card qualify for this rule? */
  when: (c: CardForGuides) => boolean;
  /** Article slugs, most specific first. */
  prefer: string[];
  /** Tag/keyword fallbacks matched against article tags and titles. */
  match: string[];
  /** Why this guide is being shown — rendered as the link's supporting line. */
  reason: (c: CardForGuides) => string;
};

// Roughly $40 in any of the six currencies we price in. A deliberately blunt
// threshold: it decides which of two guides to show, not anything a reader relies on.
const EXPENSIVE_CENTS = 4000;

const RULES: Rule[] = [
  {
    when: (c) => c.isSignature || c.rarity === "Showcase" || c.variant != null,
    prefer: ["understanding-riftbound-card-rarity"],
    match: ["rarity", "signature", "alt art", "showcase", "chase"],
    reason: () => "What the premium printings actually are, and which ones hold value",
  },
  {
    when: (c) => (c.priceCents ?? 0) >= EXPENSIVE_CENTS,
    prefer: ["how-to-store-and-protect-riftbound-cards"],
    match: ["storage", "protect", "sleeve", "condition", "grading"],
    reason: () => "At this price it is worth sleeving properly — how to store and protect it",
  },
  {
    when: (c) => c.isPromo,
    prefer: [],
    match: ["promo", "release", "event"],
    reason: () => "Where the promo printings come from and how they are distributed",
  },
  {
    when: () => true,
    prefer: [],
    // Set-specific: matched dynamically against the card's set name below.
    match: [],
    reason: (c) => `Buying, prices and chase cards across ${c.setName}`,
  },
  {
    when: () => true,
    prefer: ["buying-singles-vs-opening-packs"],
    match: ["singles", "packs", "value", "buying"],
    reason: () => "Whether to buy this single or chase it in packs — the maths, with real prices",
  },
  {
    when: () => true,
    prefer: ["riftbound-price-movers-how-to-track"],
    match: ["prices", "movers", "tracking", "market"],
    reason: () => "How we collect these prices and how to read a card's movement",
  },
];

export type RelatedGuide = { slug: string; title: string; category: Article["category"]; reason: string };

const norm = (s: string) => s.toLowerCase();

function scoreArticle(a: Article, needles: string[]): number {
  if (!needles.length) return 0;
  const hay = `${norm(a.title)} ${a.tags.map(norm).join(" ")} ${norm(a.excerpt)}`;
  return needles.reduce((n, needle) => n + (hay.includes(norm(needle)) ? 1 : 0), 0);
}

/**
 * Up to `limit` guides/posts relevant to this card, most relevant first.
 * Returns [] rather than filling with irrelevant articles — a "related" link
 * that isn't related is worse than no link.
 */
export function guidesForCard(card: CardForGuides, limit = 3): RelatedGuide[] {
  const articles = getArticles();
  const bySlug = new Map(articles.map((a) => [a.slug, a]));
  const picked: RelatedGuide[] = [];
  const seen = new Set<string>();

  const take = (a: Article | undefined, reason: string) => {
    if (!a || seen.has(a.slug) || picked.length >= limit) return;
    seen.add(a.slug);
    picked.push({ slug: a.slug, title: a.title, category: a.category, reason });
  };

  for (const rule of RULES) {
    if (picked.length >= limit) break;
    if (!rule.when(card)) continue;

    for (const slug of rule.prefer) take(bySlug.get(slug), rule.reason(card));
    if (picked.length >= limit) break;

    // The set rule has no fixed slugs — match on the set's own name and code.
    const needles = rule.match.length ? rule.match : [card.setName, card.setCode];
    const scored = articles
      .filter((a) => !seen.has(a.slug))
      .map((a) => ({ a, score: scoreArticle(a, needles) }))
      .filter(({ score }) => score > 0)
      .sort((x, y) => y.score - x.score || (x.a.date < y.a.date ? 1 : -1));

    if (scored.length) take(scored[0].a, rule.reason(card));
  }

  return picked;
}
