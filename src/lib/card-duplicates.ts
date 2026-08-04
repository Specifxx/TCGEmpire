import { prisma } from "./db";

// ─────────────────────────────────────────────────────────────────────────────
// Duplicate card rows → one canonical URL, the rest noindexed.
// ─────────────────────────────────────────────────────────────────────────────
// A past import created a second (and in one case a third) row for a handful of
// promo printings, giving each collision a numeric slug suffix:
//
//   /card/poppy-defender-of-the-meek-unl-178-219-promo
//   /card/poppy-defender-of-the-meek-unl-178-219-promo-112
//   /card/poppy-defender-of-the-meek-unl-178-219-promo-113
//
// Same name, set, collector number, rarity, variant and promo flag — so the
// title generator (which is deliberately identity-driven) produces byte-
// identical titles, and Google sees several URLs of duplicate content. Currently
// 3 groups / 4 excess rows out of ~1,000 cards, surfaced by a deeper crawl than
// the earlier audit reached (crawl-check now walks 601 URLs, not 451).
//
// NOT deleted, and not renamed: every URL stays live and crawlable. The extras
// get `robots: { index: false, follow: true }` and a canonical pointing at the
// primary, which is the standard consolidation — Google drops the duplicates
// from the index and folds their signals into the one URL that stays. They also
// leave the sitemap, so we never submit a URL we simultaneously ask Google not
// to index.
//
// SELF-HEALING, like getEmptyCardIds(): there is no hand-maintained list. Merge
// the rows in the database and this stops matching, with no code change.
//
// ── Why ONE catalogue-wide query, memoized ──────────────────────────────────
// The first version asked "does this card have a twin?" per card page. It was
// index-covered and cheap, and it still failed: during `next build` ~650 pages
// generate at once, and an extra query per card page is exactly the kind of load
// that trips a connection timeout. Every such failure fails OPEN (returns "not a
// duplicate", by design — a DB blip must never noindex a good page), so the
// consolidation silently applied to one of the four duplicates and not the
// others. Measured, not theorised: after a clean production build, Miss
// Fortune's duplicate had the right canonical and Poppy's two did not.
//
// One query for the whole catalogue, memoized for TTL_MS, removes the failure
// mode rather than retrying it: ~1,000 rows of eight small columns, run once per
// build instead of once per page, with a single failure point instead of a
// thousand.

/** The fields that decide whether two card rows are the same printing. */
export interface CardIdentity {
  id: string;
  slug: string | null;
  name: string;
  setCode: string;
  collectorNumber: string;
  rarity: string;
  variant: string | null;
  isPromo: boolean;
}

export interface CanonicalTwin {
  id: string;
  slug: string | null;
}

/** The natural key two rows must share to be the same printing. */
export function identityKey(c: Omit<CardIdentity, "id" | "slug">): string {
  return [c.name, c.setCode, c.collectorNumber, c.rarity, c.variant ?? "", c.isPromo ? "promo" : ""]
    .join("|")
    .toLowerCase();
}

/**
 * Which row of a duplicate group is the canonical one.
 *
 * Sorted by slug length first so the ORIGINAL (unsuffixed) slug always wins —
 * the numeric suffix is exactly what the collision added — with a lexical
 * tiebreak so the answer never depends on row order coming back from the
 * database.
 */
export function primaryOf(rows: CanonicalTwin[]): CanonicalTwin {
  return [...rows].sort(
    (a, b) => (a.slug ?? a.id).length - (b.slug ?? b.id).length || (a.slug ?? a.id).localeCompare(b.slug ?? b.id),
  )[0];
}

/**
 * Group a catalogue into "non-primary card id → its canonical twin".
 * Pure, so the grouping and primary-selection rules are unit-testable without a
 * database (see tests/card-duplicates.test.ts).
 */
export function buildDuplicateMap(cards: CardIdentity[]): Map<string, CanonicalTwin> {
  const groups = new Map<string, CardIdentity[]>();
  for (const c of cards) {
    const key = identityKey(c);
    const list = groups.get(key);
    if (list) list.push(c);
    else groups.set(key, [c]);
  }

  const out = new Map<string, CanonicalTwin>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const primary = primaryOf(list);
    for (const c of list) if (c.id !== primary.id) out.set(c.id, { id: primary.id, slug: primary.slug });
  }
  return out;
}

const TTL_MS = 10 * 60 * 1000;

type Cached = { at: number; map: Map<string, CanonicalTwin> };
const globalForDupes = globalThis as unknown as { __rcDupes?: Cached; __rcDupesInflight?: Promise<Cached> };

/**
 * The duplicate map for the whole catalogue.
 *
 * Fails OPEN — a database problem yields an empty map, i.e. "nothing is a
 * duplicate", so a blip can never noindex a page that should be indexed or empty
 * the sitemap. The empty result is NOT cached, so the next caller retries.
 */
export async function getDuplicateMap(): Promise<Map<string, CanonicalTwin>> {
  const cached = globalForDupes.__rcDupes;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.map;
  // Concurrent page renders during a build would otherwise each fire the query.
  if (globalForDupes.__rcDupesInflight) return (await globalForDupes.__rcDupesInflight).map;

  const run = (async (): Promise<Cached> => {
    try {
      const rows = await prisma.card.findMany({
        select: {
          id: true,
          slug: true,
          name: true,
          setCode: true,
          collectorNumber: true,
          rarity: true,
          variant: true,
          isPromo: true,
        },
      });
      const entry: Cached = { at: Date.now(), map: buildDuplicateMap(rows) };
      globalForDupes.__rcDupes = entry;
      return entry;
    } catch {
      // Not cached: `at: 0` is always older than the TTL, so the next call retries.
      return { at: 0, map: new Map() };
    } finally {
      globalForDupes.__rcDupesInflight = undefined;
    }
  })();

  globalForDupes.__rcDupesInflight = run;
  return (await run).map;
}

/**
 * The canonical twin for one card, or null when the card is not a duplicate (or
 * IS the canonical one).
 */
export async function getCanonicalTwin(card: { id: string }): Promise<CanonicalTwin | null> {
  return (await getDuplicateMap()).get(card.id) ?? null;
}

/** Every NON-primary duplicate id, for the sitemap generator. */
export async function getDuplicateCardIds(): Promise<Set<string>> {
  return new Set((await getDuplicateMap()).keys());
}
