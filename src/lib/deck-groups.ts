// Programmatic meta-deck landing pages: /decks/archetype/<slug> and
// /decks/domain/<slug>.
//
// WHY THIS EXISTS: riftcore.app carries ~45,500 indexable URLs against our
// ~1,700, and the bulk of theirs is programmatic deck pages. We cannot and must
// not match that by minting a page per user-submitted list — we don't have user
// lists, and inventing them is fabrication. What we DO have that they don't is a
// live multi-store price on every card, so the honest way to add deck breadth is
// to cut the REAL tournament lists we already carry (prisma/meta-decks.json)
// along the two axes people actually search — "riftbound aggro deck", "best fury
// deck" — and answer each with the thing only a price-comparison site can:
// what that shelf of decks costs today and which cart is cheapest.
//
// THE ALLOWLIST IS NOT FREE-FORM. Same discipline as lib/champions.ts: every
// group below is an explicit entry whose `tokens` must match at least one REAL
// deck's archetype string / domain list. tests/deck-groups.test.ts asserts both
// directions — no group may be invented that no deck belongs to, and no real
// archetype fragment may be left with no group covering it. That is what stops
// this file drifting into a page generator for queries we can't answer.
//
// THIN PAGES ARE PREVENTED, NOT PATCHED. A group with zero decks 404s (there is
// nothing to say). A group with one deck renders — it's linked, crawlable, and
// its single deck is real — but carries robots:noindex and is left out of the
// sitemap, exactly as champions/facets/stores already behave. Only groups at or
// above DECK_GROUP_THIN_THRESHOLD are submitted. All three states are derived
// from the same predicate here so the page and the sitemap cannot disagree.
import { META_DECKS, type MetaDeckSeed, type ResolvedDeck } from "./meta-decks";
import { DOMAIN_KEYS, DOMAINS } from "./constants";

export type DeckGroupAxis = "archetype" | "domain";

export interface DeckGroup {
  axis: DeckGroupAxis;
  slug: string;
  /** Canonical display name, e.g. "Aggro" / "Fury". */
  name: string;
  /**
   * Lowercase fragments that identify a deck as part of this group.
   *
   * archetype: matched against the slash-separated parts of MetaDeckSeed.archetype
   *   ("Aggro / Tempo" → ["aggro", "tempo"]), so a hybrid list correctly appears
   *   under BOTH of its parents rather than being forced into one.
   * domain: matched against MetaDeckSeed.domains.
   */
  tokens: string[];
  /**
   * Generic strategy identity. Deliberately phrased as how the label is used
   * across trading card games, NOT as a claim about Riftbound's printed rules —
   * the same line lib/facets.ts draws for its facet intros, and the reason
   * lib/keywords.ts's DATA-ACCURACY RULE isn't engaged here: naming a deck
   * "aggro" is a description of the lists on the page, not a rules assertion.
   */
  summary: string;
  /** The price-comparison angle, unique per group. */
  buyerAngle: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Archetype groups.
// ─────────────────────────────────────────────────────────────────────────────
// Every token below was read off the real `archetype` strings in
// prisma/meta-decks.json, which today are: Tempo, Aggro / Disruption,
// Aggro / Tempo, Spell Tempo, Value Midrange, Gear Midrange, Aggro / Combo,
// Tempo / Reach, Midrange, Aggro.
export const ARCHETYPE_GROUPS: DeckGroup[] = [
  {
    axis: "archetype",
    slug: "aggro",
    name: "Aggro",
    tokens: ["aggro"],
    summary:
      "Aggro lists spend their energy early and try to end the game before the opponent's expensive cards matter. They lean on cheap units, cheap interaction and a low curve rather than late-game power.",
    buyerAngle:
      "Aggro is usually the cheapest competitive shelf to buy into, because a low curve means commons and uncommons rather than a stack of Epics — but not always, and the table below prices each list live rather than assuming it.",
  },
  {
    axis: "archetype",
    slug: "tempo",
    name: "Tempo",
    tokens: ["tempo"],
    summary:
      "Tempo decks trade efficiency for speed: they aim to spend each turn more usefully than the opponent can answer, keeping the board ahead rather than racing flat out or grinding for value.",
    buyerAngle:
      "Tempo shells concentrate their cost in a handful of premium two- and three-drops, so the build cost is dominated by a few cards. That makes them the archetype where shopping the individual singles around, instead of buying a whole list from one store, saves the most.",
  },
  {
    axis: "archetype",
    slug: "midrange",
    name: "Midrange",
    tokens: ["midrange"],
    summary:
      "Midrange sits between the two: bodies efficient enough to survive the early turns and strong enough to still matter late, winning on card quality rather than speed or combo.",
    buyerAngle:
      "Midrange lists spread their value across the whole curve, so the price is spread too — fewer single expensive chases, more mid-priced cards. That tends to make them the archetype where a consolidated cheapest-cart order beats buying card by card.",
  },
  {
    axis: "archetype",
    slug: "combo",
    name: "Combo",
    tokens: ["combo"],
    summary:
      "Combo lists are built around a specific interaction between cards and accept a weaker fair game in exchange for it. They live or die on drawing their pieces.",
    buyerAngle:
      "A combo list's price is concentrated in its pieces: the cards it cannot function without are the ones you must buy at full playset, which is exactly where a per-card price comparison pays for itself.",
  },
  {
    axis: "archetype",
    slug: "disruption",
    name: "Disruption",
    tokens: ["disruption"],
    summary:
      "Disruption decks attack the opponent's plan rather than their board — stripping resources, answering key cards and making the other list work harder for the same result.",
    buyerAngle:
      "Disruption packages are answer-dense, and answers are printed at every rarity, so the same effect often exists at very different prices. Comparing every printing is the difference between an affordable list and an expensive one.",
  },
  {
    axis: "archetype",
    slug: "value",
    name: "Value",
    tokens: ["value"],
    summary:
      "Value lists aim to come out of every exchange with more cards or more board than they put in, and win once that advantage compounds far enough.",
    buyerAngle:
      "Value decks are the ones most often built on cheap staples rather than headline chases, which is why the budget standouts on this site keep landing here.",
  },
  {
    axis: "archetype",
    slug: "gear",
    name: "Gear",
    tokens: ["gear"],
    summary:
      "Gear-centric lists build their advantage out of equipment that stays on the board, so their threats accumulate across turns instead of arriving all at once.",
    buyerAngle:
      "Gear pieces are permanents you run in multiples, so a playset premium hits harder here than in most archetypes — worth checking whether an alternate-art or promo printing of the same card is currently the cheaper one.",
  },
  {
    axis: "archetype",
    slug: "spell",
    name: "Spell",
    tokens: ["spell"],
    summary:
      "Spell-led lists carry a low unit count and a high count of one-shot effects, converting cards into reach and interaction rather than a persistent board.",
    buyerAngle:
      "Spell density means a long tail of cheap singles plus a short list of expensive ones. Total build cost is therefore very sensitive to postage — buying forty cheap cards from six stores can cost more in shipping than in cards.",
  },
  {
    axis: "archetype",
    slug: "reach",
    name: "Reach",
    tokens: ["reach"],
    summary:
      "Reach is the ability to close a game the board can't — direct damage and finishers that go over the top of a stalled position rather than through it.",
    buyerAngle:
      "Reach finishers are the cards that decide games, so they hold their price better than the rest of a list. If you are buying in stages, they are the ones worth watching rather than waiting on.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Domain groups — one per Riftbound domain, sourced from DOMAIN_KEYS so this can
// never name a domain the rest of the site doesn't recognise.
// ─────────────────────────────────────────────────────────────────────────────
// These deliberately DON'T compete with /domains/<slug>, which is the card
// facet ("every Fury card, priced"). This axis is the deck question ("which meta
// decks play Fury, and what do they cost to build"), and the two cross-link.
// Deck-side copy, deliberately written FROM SCRATCH rather than reused from
// DOMAIN_PAGES[].lore in lib/domains.ts. The two pages describe the same domain
// for different readers — a collector pricing singles there, a builder pricing a
// list here — and shipping the same paragraph on both would make the pair a
// near-duplicate cluster, which is the failure this whole surface is trying to
// avoid rather than create.
const DOMAIN_ANGLE: Record<string, { summary: string; buyerAngle: string }> = {
  Fury: {
    summary:
      "Fury is Riftbound's aggressive domain — fast units and direct damage built to close a game before the expensive cards on the other side of the table start to matter. In deckbuilding terms it supplies the pressure half of a pairing: cheap bodies, a low curve, and the reach to finish from a board that has stalled.",
    buyerAngle:
      "That low curve is why Fury is usually the affordable side of a two-domain list — the cards doing the work are commons and uncommons you run in multiples rather than single expensive chases. The catch is quantity: forty cheap singles bought from six different stores can cost more in postage than in cards, which is exactly what the consolidated cart below solves.",
  },
  Calm: {
    summary:
      "Calm is the domain of growth and resilience, built to win the long game rather than the fast one. Its lists lean on cards that keep paying out across turns, so they trade early speed for the ability to still be doing something on turn ten.",
    buyerAngle:
      "Calm packages are bought once and kept: because they win on accumulated value rather than on a specific metagame call, they age better than aggro shells and rarely need replacing after a set drops. That makes them the domain where buying the good version of a card first, instead of the cheap version twice, is most often the cheaper path overall.",
  },
  Mind: {
    summary:
      "Mind is the control and knowledge domain — card advantage, information and outthinking the opponent rather than outpacing them. Its decks are built around a small number of engines that do a lot of work, with the rest of the list existing to protect them.",
    buyerAngle:
      "That concentration is a buying problem as much as a play pattern: a Mind list's price is dominated by a handful of premium cards, so the total swings hard on what those few are listed at today. It is the domain where comparing every store on one card moves the build cost most, and where a single restock can change which list is cheapest.",
  },
  Body: {
    summary:
      "Body is the domain of endurance and physical power, built on durable units and repeated combat rather than tricks. Its decks want to be ahead on the board and stay there, so they fill the curve with bodies that trade up and survive to attack again.",
    buyerAngle:
      "Body staples are units you run at a full playset, so the number that decides a Body build cost is the price of three copies, not one — and stores that have three in stock at the cheap price are rarer than stores that have one. The cart below prices real available quantities rather than assuming a store can fill the whole line.",
  },
  Chaos: {
    summary:
      "Chaos is the domain of disruption and unpredictability, trading stability for high-risk, high-reward plays. It is the most-played domain of the current metagame, and it shows up on both halves of the field — attached to aggressive shells that want reach and to grindier lists that want answers.",
    buyerAngle:
      "Being the most-played domain makes its staples the most contested, and contested cards are the ones whose price moves first when a list wins an event. If you are buying into Chaos, the cards shared across the lists below are the ones worth buying before the next results post rather than after.",
  },
  Order: {
    summary:
      "Order is the domain of structure and protection, rewarding disciplined play and strong support over raw aggression. Its decks are built to make favourable exchanges and to keep the pieces that matter alive long enough to win with them.",
    buyerAngle:
      "Order's protective effects have been printed and reprinted across sets, which means the same job is often available at several very different prices. That makes it the domain where the alternate printing, the older set's version or the promo is most likely to be the cheaper buy — worth opening each card page before committing to a list.",
  },
  Colorless: {
    summary:
      "Colorless cards carry no domain allegiance and slot into any Riftbound deck, which makes them the closest thing the format has to universal staples. They are chosen for raw rate rather than for what they combine with.",
    buyerAngle:
      "Because they fit every list, colorless staples are bought by more players than any single domain's cards and restock less predictably. They are the cards most worth taking at a playset while a store actually has them, rather than waiting for the price to drift back down.",
  },
};

export const DOMAIN_DECK_GROUPS: DeckGroup[] = DOMAIN_KEYS.map((k) => ({
  axis: "domain" as const,
  slug: k.toLowerCase(),
  name: DOMAINS[k].label,
  tokens: [String(DOMAINS[k].label).toLowerCase()],
  ...DOMAIN_ANGLE[k],
}));

export const DECK_GROUPS: DeckGroup[] = [...ARCHETYPE_GROUPS, ...DOMAIN_DECK_GROUPS];

export const deckGroupPath = (g: Pick<DeckGroup, "axis" | "slug">): string => `/decks/${g.axis}/${g.slug}`;

export function deckGroupBySlug(axis: DeckGroupAxis, slug: string): DeckGroup | undefined {
  const s = slug.toLowerCase();
  return DECK_GROUPS.find((g) => g.axis === axis && g.slug === s);
}

/** The archetype string's parts, normalised for matching: "Aggro / Tempo" → ["aggro","tempo"]. */
export const archetypeParts = (archetype: string): string[] =>
  archetype
    .split("/")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

/** Does this seed belong to the group? Pure — no DB, so the sitemap and the
 *  page and the tests all read the same answer from the same static seed data. */
export function deckInGroup(seed: MetaDeckSeed, group: DeckGroup): boolean {
  if (group.axis === "domain") {
    return seed.domains.some((d) => group.tokens.includes(d.toLowerCase()));
  }
  const parts = archetypeParts(seed.archetype);
  // Word-boundary containment, not equality: "Value Midrange" belongs to both
  // `value` and `midrange`, which is the whole point of splitting the axis.
  return parts.some((p) => group.tokens.some((t) => new RegExp(`(^|\\s)${t}(\\s|$)`).test(p)));
}

/** Every real meta deck in this group, in the site's usual tier-then-metashare order. */
export function seedsInGroup(group: DeckGroup): MetaDeckSeed[] {
  return META_DECKS.filter((d) => deckInGroup(d, group)).sort(
    (a, b) => Number(a.tier) - Number(b.tier) || (b.metaSharePct ?? 0) - (a.metaSharePct ?? 0)
  );
}

// Minimum real decklists for a group page to be worth indexing. TWO, not eight
// (the champion/facet number): a champion hub's content IS its card grid, so a
// short grid is a short page, whereas one deck's worth of content here is a full
// 66-card list, a tournament attribution, a priced buy list and a comparison
// table — the page is only THIN in the sense that "best X decks" plural is a
// promise a single list doesn't keep. That is a relevance judgement, not a
// volume one, hence a different threshold with its own reason.
export const DECK_GROUP_THIN_THRESHOLD = 2;

/** Indexable = enough real lists to answer the plural query the URL promises. */
export const deckGroupIsIndexable = (group: DeckGroup): boolean =>
  seedsInGroup(group).length >= DECK_GROUP_THIN_THRESHOLD;

/** Groups submitted to the sitemap. Same predicate the page's robots tag uses,
 *  so a URL can never be submitted and noindexed at the same time. */
export const indexableDeckGroups = (): DeckGroup[] => DECK_GROUPS.filter(deckGroupIsIndexable);

/** Groups that render at all. A group no real deck belongs to has nothing to say
 *  and 404s rather than serving an empty shell. */
export const liveDeckGroups = (): DeckGroup[] => DECK_GROUPS.filter((g) => seedsInGroup(g).length > 0);

// ─────────────────────────────────────────────────────────────────────────────
// PRICE SANITY. Nothing on these pages may quote a build cost we don't actually
// have the data to stand behind.
// ─────────────────────────────────────────────────────────────────────────────
// A "cheapest deck" figure is a shopping claim, and the failure modes are all
// silent: a null price summed as 0 renders "from $0.00"; a scraped listing with
// a misplaced decimal renders a $40,000 deck; a list where 3 of 44 cards resolved
// renders a real-looking number that is nothing like what the deck costs. Each
// would be published as fact to someone about to spend money.
//
// So a deck's cost is PUBLISHABLE only when all three hold, and callers that get
// null must render "not enough live listings yet" rather than a number.

/** A deck must have a live price on at least this share of its priceable cards
 *  before its total is quoted as a build cost. Below it the number is real
 *  arithmetic over an unreal basket. */
export const DECK_PRICE_COVERAGE_MIN = 0.6;

/** Sanity band on the per-card average, which is the scale-free way to catch a
 *  bad decimal in either direction. A 44-card competitive list averaging under
 *  5c/card or over $200/card is a data fault, not a market. */
export const MIN_AVG_CARD_CENTS = 5;
export const MAX_AVG_CARD_CENTS = 200_00;

export interface DeckCostVerdict {
  ok: boolean;
  /** Total in cents, only when ok. */
  totalCents: number | null;
  coverage: number;
  /** Why it was rejected — surfaced in the gate script's output, never to users. */
  reason?: "no-cards" | "zero-total" | "low-coverage" | "out-of-band";
}

type CostShape = Pick<ResolvedDeck, "totalCents" | "pricedCards" | "priceableCards">;

/** The one place that decides whether a build cost may be shown. */
export function deckCostVerdict(d: CostShape): DeckCostVerdict {
  const coverage = d.priceableCards > 0 ? d.pricedCards / d.priceableCards : 0;
  if (d.priceableCards <= 0 || d.pricedCards <= 0) {
    return { ok: false, totalCents: null, coverage, reason: "no-cards" };
  }
  if (!Number.isFinite(d.totalCents) || d.totalCents <= 0) {
    return { ok: false, totalCents: null, coverage, reason: "zero-total" };
  }
  if (coverage < DECK_PRICE_COVERAGE_MIN) {
    return { ok: false, totalCents: null, coverage, reason: "low-coverage" };
  }
  const avg = d.totalCents / d.pricedCards;
  if (avg < MIN_AVG_CARD_CENTS || avg > MAX_AVG_CARD_CENTS) {
    return { ok: false, totalCents: null, coverage, reason: "out-of-band" };
  }
  return { ok: true, totalCents: d.totalCents, coverage };
}

/** Convenience: cents when publishable, null otherwise. */
export const publishableDeckCents = (d: CostShape): number | null => deckCostVerdict(d).totalCents;

/** Cheapest deck in a set whose cost is actually publishable. Never picks an
 *  unpriced or under-covered list just because its total sorts lowest. */
export function cheapestPublishableDeck<T extends CostShape>(decks: T[]): T | null {
  const priced = decks.filter((d) => deckCostVerdict(d).ok);
  return priced.length ? priced.reduce((a, b) => (b.totalCents < a.totalCents ? b : a)) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata copy. Built here rather than in the route so tests/deck-groups.test.ts
// can assert every generated title and description is unique and non-empty
// WITHOUT a database or a running server — which is the only way the duplicate-
// title gate can actually block a PR.
// ─────────────────────────────────────────────────────────────────────────────

/** The " — RiftCompare" the root layout's title template appends. */
export const TITLE_SUFFIX = " — RiftCompare";

export function deckGroupTitle(g: DeckGroup): string {
  return g.axis === "archetype"
    ? `Riftbound ${g.name} Decks & Build Cost`
    : `Riftbound ${g.name} Domain Decks & Build Cost`;
}

export function deckGroupDescription(g: DeckGroup): string {
  const seeds = seedsInGroup(g);
  const n = seeds.length;
  const lists = `${n} real tournament ${n === 1 ? "list" : "lists"}`;
  // NAME THE LEGENDS. Without them these descriptions varied only by the group's
  // own name, so the nine deck-group pages read as two descriptions to a
  // near-duplicate detector (GROWTH-AUDIT.md § 4) — digits are discounted and
  // every other token was shared. Champion names are the most varying real fact
  // on the page, they are what people actually search, and they come from the
  // same seed list the page renders, so the snippet can never name a deck the
  // page doesn't show.
  //
  // From the deck NAME, not the `legend` field. Two of the ten legends are
  // unusable as champion names: "Master, Wuju Bladesman - Starter" carries the
  // seed.ts slugify bug documented in lib/champions.ts (it should be Master Yi),
  // and "Void Burrower" has no champion prefix at all. The deck names — "Master
  // Yi, Wuju Bladesman", "Reksai, Void Burrower" — are clean, and are also the
  // names a reader would recognise.
  const legends = [...new Set(seeds.map((s) => s.name.split(",")[0].trim()).filter(Boolean))];
  const led = legends.length
    ? ` Led by ${legends.slice(0, 3).join(", ")}${legends.length > 3 ? " and more" : ""}.`
    : "";
  return g.axis === "archetype"
    ? `Every ${g.name.toLowerCase()} deck in the current Riftbound metagame — ${lists}, priced live so you can see what each costs to build.${led}`
    : `Every meta Riftbound deck playing the ${g.name} domain — ${lists} with live build costs and the cheapest cart to buy one.${led}`;
}

/** H1. Distinct from the <title> on purpose: the tag carries the query, the
 *  heading reads as a sentence on the page. */
export function deckGroupHeading(g: DeckGroup): string {
  return g.axis === "archetype"
    ? `Riftbound ${g.name.toLowerCase()} decks — meta lists and what they cost`
    : `Riftbound ${g.name} decks — meta lists and what they cost`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared staples — the cards this group's lists actually agree on.
// ─────────────────────────────────────────────────────────────────────────────
// This is the section that makes each group page genuinely different from every
// other one rather than the same template with a name swapped: it is computed
// from the real decklists, so the Aggro page's staples and the Chaos page's
// staples are different card sets with different prices. Pure (names + counts
// only) so it can be asserted in a DB-free test; the route enriches it with live
// prices afterwards.
export interface DeckStaple {
  name: string;
  /** How many of the group's decks run it. */
  deckCount: number;
  /** Highest quantity any one of those decks runs. */
  maxQty: number;
  section: string;
}

/** Cards played by at least `minDecks` of the group's lists, most-shared first.
 *  Runes are excluded for the same reason build cost excludes them: every deck
 *  in a domain runs the same rune base, so listing them as "what these decks
 *  agree on" is true and useless. */
export function groupStaples(seeds: MetaDeckSeed[], minDecks = 2): DeckStaple[] {
  const byName = new Map<string, DeckStaple>();
  for (const seed of seeds) {
    // Per deck, not per line: a list running 3 copies must still count once.
    const seen = new Map<string, { qty: number; section: string }>();
    for (const c of seed.cards) {
      if (c.section === "rune" || c.section === "sideboard") continue;
      const prev = seen.get(c.name);
      seen.set(c.name, { qty: Math.max(prev?.qty ?? 0, c.qty), section: c.section });
    }
    for (const [name, { qty, section }] of seen) {
      const e = byName.get(name);
      if (e) {
        e.deckCount += 1;
        e.maxQty = Math.max(e.maxQty, qty);
      } else {
        byName.set(name, { name, deckCount: 1, maxQty: qty, section });
      }
    }
  }
  return [...byName.values()]
    .filter((s) => s.deckCount >= minDecks)
    .sort((a, b) => b.deckCount - a.deckCount || b.maxQty - a.maxQty || a.name.localeCompare(b.name));
}
