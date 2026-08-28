// Derived metagame statistics for the /decks hub, computed IN MEMORY from the
// resolved deck list the page already loads — no extra database reads, and no
// number on the page this module can't trace back to a real decklist or a real
// live price.
//
// THE LINE THIS FILE HOLDS: everything here is arithmetic over data we actually
// carry — the curated tournament lists in prisma/meta-decks.json and the card
// rows the resolver priced. Nothing is modelled, projected or imputed. The
// riftDecks-style features that need data we don't have (matchup win rates,
// metashare-over-time, per-event deck dumps) are deliberately absent rather
// than approximated; see the page copy, which says what the figures are and
// where they come from.
//
// Pure on purpose (no prisma import): tests/deck-hub-stats.test.ts exercises
// every function against the real seed JSON without a database, which is the
// only way these stats can gate a PR.
import type { MetaDeckSeed, ResolvedDeck } from "./meta-decks";
import { deckCostVerdict } from "./deck-groups";
import { normalizeSearch } from "./format";

// Sections that count toward "the 40-card main deck" for staples/curve stats.
// Runes are excluded for the same reason build cost excludes them (every deck in
// a domain runs the same 12), battlefields because they're a fixed 3-slot layer
// with its own dynamics, and the side deck because it isn't the main deck.
const CORE_SECTIONS = new Set(["champion", "unit", "gear", "spell"]);

// ─────────────────────────────────────────────────────────────────────────────
// Cross-deck staples — the cards the whole metagame agrees on.
// ─────────────────────────────────────────────────────────────────────────────

export interface MetaStaple {
  /** Card name as the decklists spell it. */
  name: string;
  /** How many distinct decks run it (a deck counts once, whatever its qty). */
  deckCount: number;
  /** The highest copy-count any single list runs. */
  typicalQty: number;
  /** Total copies across every list's main deck — the demand signal. */
  totalCopies: number;
  section: string;
  /** The decks that play it, in the caller's order. */
  decks: { slug: string; name: string }[];
}

/** Cards played by at least `minDecks` of the field's main decks, most-shared
 *  first. Champion/unit/gear/spell sections only — see CORE_SECTIONS. */
export function metaStaples(decks: (MetaDeckSeed | ResolvedDeck)[], minDecks = 2): MetaStaple[] {
  const byKey = new Map<string, MetaStaple>();
  for (const deck of decks) {
    // Collapse a deck's duplicate lines first so one list never counts twice.
    const seen = new Map<string, { name: string; qty: number; section: string }>();
    for (const c of deck.cards) {
      if (!CORE_SECTIONS.has(c.section)) continue;
      const key = normalizeSearch(c.name);
      const prev = seen.get(key);
      seen.set(key, { name: c.name, qty: (prev?.qty ?? 0) + c.qty, section: prev?.section ?? c.section });
    }
    for (const [key, { name, qty, section }] of seen) {
      const e = byKey.get(key);
      if (e) {
        e.deckCount += 1;
        e.totalCopies += qty;
        e.typicalQty = Math.max(e.typicalQty, qty);
        e.decks.push({ slug: deck.slug, name: deck.name });
      } else {
        byKey.set(key, {
          name,
          deckCount: 1,
          typicalQty: qty,
          totalCopies: qty,
          section,
          decks: [{ slug: deck.slug, name: deck.name }],
        });
      }
    }
  }
  return [...byKey.values()]
    .filter((s) => s.deckCount >= minDecks)
    .sort((a, b) => b.deckCount - a.deckCount || b.totalCopies - a.totalCopies || a.name.localeCompare(b.name));
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain presence — how much of the field each domain claims.
// ─────────────────────────────────────────────────────────────────────────────

export interface DomainPresenceRow {
  domain: string;
  /** Decks whose registered pairing includes this domain. */
  deckCount: number;
  /** deckCount as % of the field (a two-domain game sums to ~200%). */
  fieldPct: number;
  /** Those decks' combined metashare, when the seed carries the figure. */
  metaSharePct: number | null;
  decks: { slug: string; name: string; tier: string }[];
}

/** Per-domain footprint of the field, most-played first. */
export function domainPresence(decks: (MetaDeckSeed | ResolvedDeck)[]): DomainPresenceRow[] {
  const rows = new Map<string, DomainPresenceRow>();
  for (const d of decks) {
    for (const dom of d.domains) {
      const e = rows.get(dom) ?? { domain: dom, deckCount: 0, fieldPct: 0, metaSharePct: null, decks: [] };
      e.deckCount += 1;
      if (d.metaSharePct != null) e.metaSharePct = (e.metaSharePct ?? 0) + d.metaSharePct;
      e.decks.push({ slug: d.slug, name: d.name, tier: d.tier });
      rows.set(dom, e);
    }
  }
  const total = decks.length || 1;
  return [...rows.values()]
    .map((r) => ({ ...r, fieldPct: Math.round((r.deckCount / total) * 100) }))
    .sort((a, b) => b.deckCount - a.deckCount || (b.metaSharePct ?? 0) - (a.metaSharePct ?? 0) || a.domain.localeCompare(b.domain));
}

export interface DomainPairingRow {
  domains: string[];
  /** Decks registered on exactly this pairing. */
  count: number;
  /** Those decks' combined metashare, when the seeds carry the figure. */
  metaSharePct: number | null;
  decks: { slug: string; name: string; tier: string }[];
}

/** Domain pairings actually registered, most common first ("Calm + Chaos ×2"). */
export function domainPairings(decks: (MetaDeckSeed | ResolvedDeck)[]): DomainPairingRow[] {
  const byKey = new Map<string, DomainPairingRow>();
  for (const d of decks) {
    const domains = [...d.domains].sort();
    const key = domains.join("+");
    const e = byKey.get(key) ?? { domains, count: 0, metaSharePct: null, decks: [] };
    e.count += 1;
    if (d.metaSharePct != null) e.metaSharePct = (e.metaSharePct ?? 0) + d.metaSharePct;
    e.decks.push({ slug: d.slug, name: d.name, tier: d.tier });
    byKey.set(key, e);
  }
  return [...byKey.values()].sort(
    (a, b) => b.count - a.count || (b.metaSharePct ?? 0) - (a.metaSharePct ?? 0) || a.domains.join().localeCompare(b.domains.join())
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Energy curve — from the resolver's card rows, so it reflects printed costs.
// ─────────────────────────────────────────────────────────────────────────────

export interface CurveBucket {
  /** "1", "2", … "6+" */
  label: string;
  /** Cards (counting copies) at that printed cost. */
  count: number;
}

const CURVE_MAX = 6; // 6+ folds the tail — Riftbound curves live almost entirely under 6.

/** Main-deck energy curve (champion/unit/gear/spell, copies counted), plus how
 *  many cards had no known cost (unresolved card or cached pre-energyCost row).
 *  Callers should render nothing when `unknown` dominates rather than a curve
 *  that silently describes half a deck. */
export function energyCurve(deck: ResolvedDeck): { buckets: CurveBucket[]; known: number; unknown: number } {
  const buckets: CurveBucket[] = Array.from({ length: CURVE_MAX }, (_, i) => ({
    label: i + 1 === CURVE_MAX ? `${CURVE_MAX}+` : String(i + 1),
    count: 0,
  }));
  let known = 0;
  let unknown = 0;
  for (const item of deck.items) {
    if (!CORE_SECTIONS.has(item.section)) continue;
    const cost = item.card?.energyCost;
    if (cost == null) {
      unknown += item.qty;
      continue;
    }
    known += item.qty;
    // Printed costs start at 1 in Riftbound; clamp anything odd into range.
    const idx = Math.min(Math.max(cost, 1), CURVE_MAX) - 1;
    buckets[idx].count += item.qty;
  }
  return { buckets, known, unknown };
}

/** Average printed cost of the known-cost main-deck cards, one decimal. Null
 *  until at least ~two-thirds of the cards have a known cost — an average over
 *  half a deck reads as fact and isn't. */
export function avgEnergyCost(deck: ResolvedDeck): number | null {
  const { buckets, known, unknown } = energyCurve(deck);
  if (known === 0 || known / (known + unknown) < 2 / 3) return null;
  // 6+ is a floor, not a value; using 6 for it slightly understates the true
  // mean, which is the conservative direction for a stat labelled "avg cost".
  const sum = buckets.reduce((n, b, i) => n + b.count * (i + 1), 0);
  return Math.round((sum / known) * 10) / 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tournament provenance — the finishes these lists were registered at.
// ─────────────────────────────────────────────────────────────────────────────

export interface DeckProvenance {
  slug: string;
  deckName: string;
  player: string;
  /** "1st", "2nd", "15th"… */
  placement: string;
  event: string;
  sourceUrl: string | null;
}

/** Parse the seed's attribution line ("CC Hope · 2nd at Riftbound Online Series
 *  S4 Week 1") into its parts. Decks whose attribution doesn't fit the pattern
 *  are omitted rather than guessed at. */
export function deckProvenance(decks: (MetaDeckSeed | ResolvedDeck)[]): DeckProvenance[] {
  const out: DeckProvenance[] = [];
  for (const d of decks) {
    const m = d.source?.match(/^(.+?)\s*·\s*(\d+(?:st|nd|rd|th))\s+at\s+(.+)$/i);
    if (!m) continue;
    out.push({
      slug: d.slug,
      deckName: d.name,
      player: m[1].trim(),
      placement: m[2].toLowerCase(),
      event: m[3].trim(),
      sourceUrl: d.sourceUrl ?? null,
    });
  }
  // Winners first, then runner-ups — the order a results page reads in.
  return out.sort((a, b) => parseInt(a.placement) - parseInt(b.placement) || a.event.localeCompare(b.event));
}

// ─────────────────────────────────────────────────────────────────────────────
// Build-cost summary — every figure passes deckCostVerdict first.
// ─────────────────────────────────────────────────────────────────────────────

export interface CostedDeck {
  deck: ResolvedDeck;
  totalCents: number;
}

export interface HubCostSummary {
  /** Publishable-cost decks, cheapest first. */
  costed: CostedDeck[];
  avgCents: number | null;
  cheapest: CostedDeck | null;
  dearest: CostedDeck | null;
  /** Cheapest publishable list among tier-1/tier-2 decks — "cheapest way into
   *  the top tables", which is a different question from cheapest overall. */
  cheapestTopTier: CostedDeck | null;
  /** Cheapest publishable list with a ≥50% win rate — the honest "budget pick
   *  that actually converts". */
  bestBudget: CostedDeck | null;
}

export function hubCostSummary(decks: ResolvedDeck[]): HubCostSummary {
  const costed = decks
    .map((deck) => ({ deck, verdict: deckCostVerdict(deck) }))
    .filter((x) => x.verdict.ok && x.verdict.totalCents != null)
    .map((x) => ({ deck: x.deck, totalCents: x.verdict.totalCents! }))
    .sort((a, b) => a.totalCents - b.totalCents);
  const avgCents = costed.length
    ? Math.round(costed.reduce((n, c) => n + c.totalCents, 0) / costed.length)
    : null;
  const topTier = costed.filter((c) => c.deck.tier === "1" || c.deck.tier === "2");
  const budget = costed.filter((c) => (c.deck.winRatePct ?? 0) >= 50);
  return {
    costed,
    avgCents,
    cheapest: costed[0] ?? null,
    dearest: costed[costed.length - 1] ?? null,
    cheapestTopTier: topTier[0] ?? null,
    bestBudget: budget[0] ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Staples on the move — the week's real price movers, filtered to this field.
// ─────────────────────────────────────────────────────────────────────────────

/** The slice of lib/price-history's Mover this module needs — structural, so the
 *  page passes real movers and the tests pass fixtures, neither importing Prisma. */
export interface MoverLike {
  card: { name: string };
  nowCents: number;
  pct: number;
}

export interface StapleMover<M extends MoverLike = MoverLike> {
  mover: M;
  /** Decks whose main deck plays the card. */
  decks: { slug: string; name: string }[];
}

/** Movers that are actually played in these decks' main decks, biggest absolute
 *  move first. Reuses the already-cached market movers read — zero extra egress —
 *  and never lists a card the field doesn't play. */
export function stapleMovers<M extends MoverLike>(
  decks: (MetaDeckSeed | ResolvedDeck)[],
  movers: M[],
  limit = 6
): StapleMover<M>[] {
  const playedBy = new Map<string, { slug: string; name: string }[]>();
  for (const d of decks) {
    for (const c of d.cards) {
      if (!CORE_SECTIONS.has(c.section)) continue;
      const key = normalizeSearch(c.name);
      const arr = playedBy.get(key) ?? [];
      if (!arr.some((x) => x.slug === d.slug)) arr.push({ slug: d.slug, name: d.name });
      playedBy.set(key, arr);
    }
  }
  const seen = new Set<string>();
  const out: StapleMover<M>[] = [];
  for (const m of movers) {
    const key = normalizeSearch(m.card.name);
    const played = playedBy.get(key);
    if (!played || seen.has(key)) continue;
    seen.add(key);
    out.push({ mover: m, decks: played });
  }
  return out.sort((a, b) => Math.abs(b.mover.pct) - Math.abs(a.mover.pct)).slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier tallies for the at-a-glance band.
// ─────────────────────────────────────────────────────────────────────────────

export function tierCounts(decks: (MetaDeckSeed | ResolvedDeck)[]): { tier: string; count: number }[] {
  const byTier = new Map<string, number>();
  for (const d of decks) byTier.set(d.tier, (byTier.get(d.tier) ?? 0) + 1);
  return [...byTier.entries()]
    .map(([tier, count]) => ({ tier, count }))
    .sort((a, b) => a.tier.localeCompare(b.tier));
}
