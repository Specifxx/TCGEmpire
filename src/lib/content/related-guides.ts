import { getArticles, type Article } from "@/lib/articles";
import { noRetailChannelProduct } from "@/lib/constants";
import { KEYWORDS } from "@/lib/keywords";

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
  /** The card's printed rules text, when the caller has it. Used ONLY to match
   *  the mechanic guide for a keyword the card actually prints — never to infer
   *  anything about what the keyword does. */
  description?: string | null;
};

/**
 * The mechanic guide for a keyword THIS CARD ACTUALLY PRINTS, or null.
 *
 * Read straight off KEYWORDS (lib/keywords.ts) rather than a second hand-written
 * map, so the marker, the set scope and the guide slug can never drift from the
 * keyword pages that use the same three fields. The predicate is the same one
 * /keywords/[slug] and the guides' own browseCta already use — "the printed
 * rules text contains the bracket marker" — so a card links to the Empower guide
 * exactly when Empower is printed on it, and to nothing when it isn't.
 */
export function mechanicGuideForCard(c: CardForGuides): { slug: string; name: string } | null {
  const text = c.description ?? "";
  if (!text) return null;
  for (const k of KEYWORDS) {
    if (k.set !== c.setCode) continue;
    if (text.includes(k.rulesContain)) return { slug: k.guideSlug, name: k.name };
  }
  return null;
}

type Rule = {
  /** Does this card qualify for this rule? */
  when: (c: CardForGuides) => boolean;
  /** Article slugs, most specific first. A function when the slug depends on the
   *  card itself — the mechanic rule resolves a different guide per keyword. */
  prefer: string[] | ((c: CardForGuides) => string[]);
  /** Tag/keyword fallbacks matched against article tags and titles. */
  match: string[];
  /**
   * Skip the tag-matching fallback for this rule and use `prefer` alone.
   *
   * Without it a rule with an empty `match` falls through to the set-name
   * needles, which is right for the generic set rule and wrong for a rule that
   * has already named the one article it wants: it would spend a second of the
   * three slots on a loosely set-matched post.
   */
  preferOnly?: boolean;
  /** Why this guide is being shown — rendered as the link's supporting line. */
  reason: (c: CardForGuides) => string;
};

// Roughly $40 in any of the six currencies we price in. A deliberately blunt
// threshold: it decides which of two guides to show, not anything a reader relies on.
const EXPENSIVE_CENTS = 4000;

const RULES: Rule[] = [
  // FIRST, and unconditional for the sets it covers. A drawing-only collector
  // printing has exactly one thing a reader wants to read next, and the generic
  // rules could not find it: the needles are the card's set NAME and CODE, and
  // scoreArticle() matches them as plain substrings against title+tags+excerpt.
  // "T1 2025 Worlds Champion Collection" never appears verbatim in either T1
  // article's title (a colon splits it) and "t1s" appears nowhere at all, so a
  // T1S card page linked to three generic guides and nothing about itself —
  // while its own About paragraph promised a guide to the drawing.
  {
    when: (c) => noRetailChannelProduct(c.setCode) != null,
    prefer: ["riftbound-t1-worlds-champion-collection"],
    match: [],
    reason: (c) => `How to get ${noRetailChannelProduct(c.setCode)?.product ?? c.setName}, what is in it, and what makes it scarce`,
  },
  // SECOND, ahead of the printing/price rules: when a card prints a keyword we
  // hold verified rules text for, the guide explaining that keyword is the most
  // useful thing a reader can open next — it is about the card in their hand,
  // not about buying in general.
  //
  // The gap this closes, measured in GROWTH-AUDIT.md § 2: a plain Vendetta rare
  // returned the Nexus Night promo post, buying-singles and where-to-buy, and
  // NONE of the three mechanic guides — which are Vendetta-specific and are the
  // site's best-performing editorial. 1,400 card pages linked to none of them.
  {
    when: (c) => mechanicGuideForCard(c) != null,
    prefer: (c) => {
      const g = mechanicGuideForCard(c);
      return g ? [g.slug] : [];
    },
    match: [],
    preferOnly: true,
    reason: (c) => `${mechanicGuideForCard(c)?.name} is printed on this card — how the mechanic works, step by step`,
  },
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

    const prefer = typeof rule.prefer === "function" ? rule.prefer(card) : rule.prefer;
    for (const slug of prefer) take(bySlug.get(slug), rule.reason(card));
    if (picked.length >= limit || rule.preferOnly) continue;

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
