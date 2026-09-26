import { getArticles, type Article } from "@/lib/articles";
import { noRetailChannelProduct } from "@/lib/constants";
import { KEYWORDS } from "@/lib/keywords";
import { guidesForTool } from "@/lib/content/tool-guides";

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
    // An unscoped entry is a core keyword printed in every set (lib/keywords.ts).
    if (k.set && k.set !== c.setCode) continue;
    if (!text.includes(k.rulesContain)) continue;
    // Only in another keyword's reminder text ("play me as a [Reaction]…").
    if (k.rulesExclude?.some((x) => text.includes(x))) continue;
    return { slug: k.guideSlug, name: k.name };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Each set's own guides, keyed by set CODE.
// ─────────────────────────────────────────────────────────────────────────────
// The card page's set rule used to find a set's article by matching the set's
// name and code against every article's tags and breaking ties by date, so each
// set's evergreen guide lost to whichever news post was newest: an Unleashed
// common linked a Radiance spoiler, an Origins card the "biggest release since
// Origins" post, a Vendetta card the Astral Heron post. The guides are named
// here instead, as data rather than template code, so a new set is one row and
// no page names a set (CURRENT-STATE, "Set-agnostic code"). Most useful first:
// a card page links the first, set pages and set galleries show them all
// ("Blog and tools, joined up", DECISIONS.md, 2026-09-26).
//
// Each `reason` says what the guide covers, in its own terms. Only articles
// whose claims about the site hold (tests/site-claims.test.ts), and none under
// ~400 words: a "read next" that is a caption and an embed reads as filler.
type GuideRef = { slug: string; reason: string };

export const SET_GUIDES: Readonly<Record<string, readonly GuideRef[]>> = {
  OGN: [{ slug: "whats-in-the-riftbound-origins-set", reason: "Origins broken down by rarity, domain and card type, counted from our own catalogue" }],
  OGS: [{ slug: "riftbound-sets-in-order", reason: "Where Proving Grounds, the smallest set, sits among the others, with each set's card count" }],
  SFD: [{ slug: "whats-in-the-riftbound-spirit-forged-set", reason: "Spirit Forged by rarity, domain and card type, with its Legends and cost curve" }],
  UNL: [{ slug: "whats-in-the-riftbound-unleashed-set", reason: "Unleashed by rarity, domain and card type, with its Legends and cost curve" }],
  VEN: [
    { slug: "riftbound-vendetta-chase-cards-so-far", reason: "Every Vendetta chase tier, from Signature Legends and Overnumbers to the Epic sleepers" },
    { slug: "riftbound-empower-explained", reason: "Vendetta's Empower mechanic step by step, and every card that carries it" },
    { slug: "riftbound-flow-explained", reason: "Where Flow lets you play cards from, what it costs, and every Flow card in the set" },
  ],
  RAD: [
    { slug: "riftbound-radiance-what-we-know", reason: "Radiance's release date, products and everything Riot has confirmed so far" },
    { slug: "riftbound-radiance-spoilers", reason: "Every Radiance card officially revealed so far, with a dated reveal log" },
    { slug: "where-to-buy-riftbound-radiance", reason: "Where to pre-order Radiance in each of the six markets we cover" },
  ],
};

function resolveGuides(refs: readonly GuideRef[]): RelatedGuide[] {
  const bySlug = new Map(getArticles().map((a) => [a.slug, a]));
  return refs.flatMap((g) => {
    const a = bySlug.get(g.slug);
    return a ? [{ slug: a.slug, title: a.title, category: a.category, reason: g.reason }] : [];
  });
}

/** `first`, topped up from `fallback` without repeating a guide, capped. */
function topUp(first: RelatedGuide[], fallback: RelatedGuide[], limit: number): RelatedGuide[] {
  const seen = new Set(first.map((g) => g.slug));
  return [...first, ...fallback.filter((g) => !seen.has(g.slug))].slice(0, limit);
}

/** The set's first PUBLISHED guide — a draft or retired slug falls through. */
function setGuide(setCode: string): GuideRef | undefined {
  const refs = SET_GUIDES[setCode];
  if (!refs) return undefined;
  const published = new Set(getArticles().map((a) => a.slug));
  return refs.find((g) => published.has(g.slug));
}

/**
 * A set page's "Read next": the set's own guides, topped up with the guides
 * behind /sets as a whole, so a set with one guide of its own (or none yet)
 * still links something about sets rather than nothing.
 */
export function guidesForSet(setCode: string, limit = 3): RelatedGuide[] {
  return topUp(resolveGuides(SET_GUIDES[setCode] ?? []), guidesForTool("/sets"), limit);
}

// Tags are hand-typed ("ksante"), hub slugs are generated from the name
// (lib/champions.ts championSlug: "K'Sante" → "k-sante", "Kai'Sa" → "kai-sa"),
// so both sides drop everything but letters and digits before comparing.
// EQUALITY, never a substring: "mel" must not match "melee", nor "vi" "vibes".
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Room left for the generic champion guides beside a champion's own articles.
const CHAMPION_OWN_MAX = 2;

/**
 * A champion hub's "Read next": our articles whose tags name THIS champion —
 * the ones with the champion in the title first, then newest — then the
 * guides behind /champions. The reason line is the article's own excerpt, so
 * it describes the piece in its own words.
 */
export function guidesForChampion(champ: { slug: string }, limit = 3): RelatedGuide[] {
  const key = squash(champ.slug);
  const named = (a: Article) => squash(a.title).includes(key);
  const own = getArticles()
    .filter((a) => a.tags.some((t) => squash(t) === key))
    .sort((x, y) => Number(named(y)) - Number(named(x)) || (x.date < y.date ? 1 : -1))
    .slice(0, CHAMPION_OWN_MAX)
    .map((a) => ({ slug: a.slug, title: a.title, category: a.category, reason: a.excerpt }));
  return topUp(own, guidesForTool("/champions"), limit);
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
  // The set's own guide, from SET_GUIDES above — and only that one: preferOnly
  // stops the tag match below spending a second slot on a loosely set-matched
  // post.
  {
    when: (c) => setGuide(c.setCode) != null,
    prefer: (c) => [setGuide(c.setCode)?.slug ?? ""],
    match: [],
    preferOnly: true,
    reason: (c) => setGuide(c.setCode)?.reason ?? "",
  },
  // A set with no SET_GUIDES row yet (a new one, before its guide is written):
  // matched on the set's name and code, as every set used to be.
  {
    when: (c) => setGuide(c.setCode) == null,
    prefer: [],
    match: [],
    reason: (c) => `Buying, prices and chase cards across ${c.setName}`,
  },
  {
    when: () => true,
    prefer: ["buying-singles-vs-opening-packs"],
    match: ["singles", "packs", "value", "buying"],
    reason: () => "Whether to buy this single or chase it in packs — the maths, with real prices",
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
